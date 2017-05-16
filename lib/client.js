'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const request = require('request');
const taskQueue = require('promise-task-queue');
const debug = require('debug')('oddworks:provider:brightcove:client');

/*
	via: https://docs.brightcove.com/en/video-cloud/cms-api/getting-started/overview-cms.html

	Avoid hard-coded URLS
	URLs for thumbnails, stills, video files, and other media should never be hard-coded
	in your pages or applications. The CMS API will always return the current current
	URLs for media files, but the URLs themselves are subject to change. You should use
	CMS API (or Playback API) calls to retrieve these URLs each time the page loads, or
	cache them for no more than six hours.

	Caching video and image URLs
	You can cache URLs for videos and images to improve page performance, but the cache
	must be refreshed regularly. If you cache the URLs you retrieve to improve the
	performance of your pages, be sure to refresh the cache by repeating the API calls
	at least once every six hours.

	Specific endpoint documentaion:
	https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html

	via: https://docs.brightcove.com/en/video-cloud/cms-api/getting-started/overview-cms.html

	To ensure the performance of the Video Cloud system, no more than 20 concurrent
	calls to the CMS API are allowed per account. Access frequency should be less
	than 10 queries per second.

	If multiple applications will be integrating to the CMS API for an account,
	then these applications should have back-off and retry logic to handle instances
	where concurrency limits or rate limits are reached.

	If the rate of requests exceeds the rate limit, a 429 - TOO_MANY_REQUESTS error
	will be returned.
*/

const CONCURRENT_REQUEST_LIMIT = 20;

class Client {
	// args.bus *optional
	// args.clientId *required
	// args.clientSecret *required
	// args.accountId *required
	// args.concurrentRequestLimit *optional
	// args.skipScheduleCheck *optional
	constructor(args) {
		this.bus = args.bus || null;

		this.clientId = args.clientId;
		this.clientSecret = args.clientSecret;
		this.accountId = args.accountId;
		this.skipScheduleCheck = _.get(args, 'skipScheduleCheck', false);

		this.concurrentRequestLimit = parseInt(args.concurrentRequestLimit, 10) || CONCURRENT_REQUEST_LIMIT;
		if (!_.isNumber(this.concurrentRequestLimit)) {
			throw new Error('Client requires concurrentRequestLimit to be a Number');
		}

		// to debug taskQueue: DEBUG=promise-task-queue:*
		this._queue = taskQueue();
		this._queue.define('request', task => {
			return Client.request(task);
		}, {
			// interval: 60 / (args.requestsPerSecondLimit || REQUESTS_PER_SECOND_LIMIT),
			concurrency: this.concurrentRequestLimit
		});

		this.getBasicAuthorization = this.getBasicAuthorization.bind(this);
		this.getBearerAuthorization = this.getBearerAuthorization.bind(this);

		this.getAccessToken = this.getAccessToken.bind(this);
		this.getPlaylistCount = this.getPlaylistCount.bind(this);
		this.getPlaylists = this.getPlaylists.bind(this);
		this.getPlaylist = this.getPlaylist.bind(this);
		this.getVideosByPlaylist = this.getVideosByPlaylist.bind(this);
		this.getVideoCountByPlaylist = this.getVideoCountByPlaylist.bind(this);
		this.getVideoCount = this.getVideoCount.bind(this);
		this.getVideos = this.getVideos.bind(this);
		this.getVideo = this.getVideo.bind(this);
		this.getVideoSources = this.getVideoSources.bind(this);
	}

	getBasicAuthorization(clientId, clientSecret) {
		const clientAuth = new Buffer(`${clientId}:${clientSecret}`);
		return `Basic ${clientAuth.toString('base64')}`;
	}

	getBearerAuthorization(accessToken) {
		return `Bearer ${accessToken}`;
	}

	// args.clientId *optional - Defaults to this.clientId
	// args.clientSecret *optional - Defaults to this.clientSecret
	// args.accessToken *optional - Overrides call to getAccessToken and returns
	//															promisified args.accessToken
	getAccessToken(args) {
		args = args || {};
		const accessToken = args.accessToken;

		if (_.isString(accessToken)) {
			return Promise.resolve({
				access_token: accessToken // eslint-disable-line camelcase
			});
		}

		const clientId = _.get(args, 'clientId', this.clientId);
		const clientSecret = _.get(args, 'clientSecret', this.clientSecret);

		if (!_.isString(clientId)) {
			throw new Error('A clientId string is required for getAccessToken()');
		}

		if (!_.isString(clientSecret)) {
			throw new Error('A clientSecret string is required for getAccessToken()');
		}

		const params = {
			method: 'POST',
			baseUrl: Client.OAUTH_BASE_URL,
			path: '/access_token',
			contentType: 'application/x-www-form-urlencoded',
			authorization: this.getBasicAuthorization(clientId, clientSecret),
			query: {
				grant_type: 'client_credentials' // eslint-disable-line camelcase
			}
		};

		return this.makeRequest(params);
	}

	// args.accountId *required
	// args.query *optional - See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-playlistGroup-Get_Playlist_Count
	getPlaylistCount(args) {
		args = args || {};
		const accountId = args.accountId || this.accountId;

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getPlaylistCount()');
		}

		return this.getAccessToken(args).then(res => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/counts/playlists`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(res.access_token),
				query: Object.assign({}, args.query)
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *required
	// args.query *optional - See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-playlistGroup-Get_Playlists
	getPlaylists(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getPlaylists()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/playlists`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: Object.assign({}, args.query)
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *optional - Defaults to this.accountId
	// args.playlistId *required - Can be a Video Cloud playlist ID or multiple
	//														 playlist IDs separated by commas
	getPlaylist(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);
		const playlistId = args.playlistId;

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getPlaylist()');
		}

		if (!_.isString(playlistId)) {
			throw new Error('A playlistId string is required for getPlaylist()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/playlists/${playlistId}`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: {}
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *required
	// args.playlistId *required
	// args.skipScheduleCheck *optional
	// args.sortByReleaseDate *optional
	getVideosByPlaylist(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);
		const playlistId = args.playlistId;
		const skipScheduleCheck = _.get(args, 'skipScheduleCheck', this.skipScheduleCheck);
		const sortByReleaseDate = _.get(args, 'sortByReleaseDate') || false;

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getVideosByPlaylist()');
		}

		if (!_.isString(playlistId)) {
			throw new Error('A playlistId string is required for getVideosByPlaylist()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/playlists/${playlistId}/videos`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: Object.assign({}, args.query)
			});

			return this
				.makeRequest(args)
				.then(videos => {
					if (!_.isEmpty(videos) && !skipScheduleCheck) {
						// using the Client.resolveIfScheduled, resolve with only published videos
						return Promise.reduce(videos.map(Client.resolveIfScheduled), (published, video) => {
							if (video) {
								published.push(video);
							}
							return Promise.resolve(published);
						}, []);
					}

					debug(`not checking schedule for playlist "${playlistId}"`);
					return Promise.resolve(videos);
				})
				.then(videos => {
					if (!_.isEmpty(videos) && sortByReleaseDate) {
						return Promise.resolve(videos.sort((a, b) => {
							let aDate = new Date(a.published_at);
							let bDate = new Date(b.published_at);

							if (_.has(a, 'schedule') &&	!_.isNull(a.schedule) && !_.isUndefined(a.schedule)) {
								const startsAt = _.get(a, 'schedule.starts_at');
								if (!_.isNaN(Date.parse(startsAt))) {
									aDate = new Date(startsAt);
								}
							}

							if (_.has(b, 'schedule') &&	!_.isNull(b.schedule) && !_.isUndefined(b.schedule)) {
								const startsAt = _.get(b, 'schedule.starts_at');
								if (!_.isNaN(Date.parse(startsAt))) {
									bDate = new Date(startsAt);
								}
							}
							// sort newest to oldest
							return bDate - aDate;
						}));
					}

					return Promise.resolve(videos);
				});
		});
	}

	// args.accountId *required
	// args.playlistId *required
	getVideoCountByPlaylist(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);
		const playlistId = args.playlistId;

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getVideoCountByPlaylist()');
		}

		if (!_.isString(playlistId)) {
			throw new Error('A playlistId string is required for getVideoCountByPlaylist()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/counts/playlists/${playlistId}/videos`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: {}
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *required
	// args.query *optional - See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-videoGroup-Get_Video_Count
	getVideoCount(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getVideoCount()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/counts/videos`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: Object.assign({}, args.query)
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *required
	// args.query *optional - See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-videoGroup-Get_Videos
	// args.skipScheduleCheck *optional
	getVideos(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);
		const skipScheduleCheck = _.get(args, 'skipScheduleCheck', this.skipScheduleCheck);

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getVideos()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/videos`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: Object.assign({}, args.query)
			});

			return this
							.makeRequest(args)
							.then(videos => {
								if (!_.isEmpty(videos) && !skipScheduleCheck) {
									// using the Client.resolveIfScheduled, resolve with only published videos
									return Promise.reduce(videos.map(Client.resolveIfScheduled), (published, video) => {
										if (video) {
											published.push(video);
										}
										return Promise.resolve(published);
									}, []);
								}

								debug('not checking schedule for videos');
								return Promise.resolve(videos);
							});
		});
	}

	// args.accountId *optional - Defaults to this.accountId
	// args.videoId *required - Can be a Video Cloud video ID, multiple IDs
	// 													separated by commas, or a single reference
	// 													ID (ref:reference_id). See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-videoGroup-Get_Video_by_ID_or_Reference_ID
	// args.skipScheduleCheck *optional
	getVideo(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);
		const videoId = args.videoId;
		const skipScheduleCheck = _.get(args, 'skipScheduleCheck', this.skipScheduleCheck);
		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getVideo()');
		}

		if (!_.isString(videoId)) {
			throw new Error('A videoId string is required for getVideo()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/videos/${videoId}`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: {}
			});

			return this
							.makeRequest(args)
							.then(video => {
								debug(`video "${videoId}" exists: ${Boolean(video)} skipScheduleCheck: ${skipScheduleCheck}`);
								if (video && !skipScheduleCheck) {
									// using the Client.resolveIfScheduled, resolve with only published videos
									return Client.resolveIfScheduled(video);
								}

								return Promise.resolve(video);
							});
		});
	}

	// args.accountId *optional - Defaults to this.accountId
	// args.videoId *required - Can be a Video Cloud video ID or a single reference
	// 													ID (ref:reference_id). See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-videoGroup-Get_Video_Sources
	getVideoSources(args) {
		args = args || {};
		const accountId = _.get(args, 'accountId', this.accountId);
		const videoId = args.videoId;

		if (!_.isString(accountId)) {
			throw new Error('An accountId string is required for getVideo()');
		}

		if (!_.isString(videoId)) {
			throw new Error('A videoId string is required for getVideo()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/videos/${videoId}/sources`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: {}
			});

			return this.makeRequest(args);
		});
	}

	makeRequest(args) {
		args = args || {};
		const method = _.get(args, 'method', 'GET');
		const path = args.path;
		const baseUrl = _.get(args, 'baseUrl', Client.CMS_API_BASE_URL);

		const contentType = _.get(args, 'contentType', Client.DEFAULT_CONTENT_TYPE);
		const authorization = args.authorization;

		let body = '';
		if (method === 'POST' && _.has(args, 'body')) {
			body = Object.assign({}, args.body);
			body = JSON.stringify(body);
		}

		if (!_.isString(authorization)) {
			throw new Error('An authorization string is required for makeRequest()');
		}

		const headers = {
			'authorization': authorization,
			'content-type': contentType
		};
		const qs = Object.assign({}, args.query);
		const url = `${baseUrl}${path}`;

		return this._queue.push('request', {method, url, qs, headers, body});
	}

	static get OAUTH_BASE_URL() {
		return 'https://oauth.brightcove.com/v3';
	}

	static get CMS_API_BASE_URL() {
		return 'https://cms.api.brightcove.com/v1';
	}

	static get STATUS_CODE_20X_MATCHER() {
		return /20\d/;
	}

	static get CONTENT_TYPE_MATCHER() {
		return /^application\/json/;
	}

	static get DEFAULT_CONTENT_TYPE() {
		return 'application/json';
	}

	static resolveIfScheduled(video) {
		if (_.has(video, 'schedule') &&
				!_.isNull(video.schedule) &&
				!_.isUndefined(video.schedule)) {
			const now = _.now();
			const startsAt = Date.parse(_.get(video, 'schedule.starts_at'));
			const endsAt = Date.parse(_.get(video, 'schedule.ends_at'));

			if ((_.isNumber(endsAt) && _.isNumber(startsAt)) && _.inRange(now, startsAt, endsAt + 1)) {
				// video is not scheduled yet
				debug(`video "${video.id} is not scheduled: ${JSON.stringify(video.schedule)}`);
				return Promise.resolve(null);
			} else if (_.isNumber(startsAt) && now <= startsAt) {
				// video is not scheduled yet
				debug(`video "${video.id} is not scheduled: ${JSON.stringify(video.schedule)}`);
				return Promise.resolve(null);
			}

			return Promise.resolve(video);
		}

		return Promise.resolve(video);
	}

	static request(params) {
		return new Promise((resolve, reject) => {
			request(params, (err, res, body) => {
				if (err) {
					debug(`ERROR ${params.method} ${params.url} qs:${JSON.stringify(params.qs)} error: ${err}`);
					return reject(err);
				}

				if (res.statusCode === 404) {
					debug(`404 ${params.method} ${params.url} qs:${JSON.stringify(params.qs)}`);
					return resolve(null);
				}

				if (!Client.STATUS_CODE_20X_MATCHER.test(res.statusCode)) {
					debug(`${res.statusCode} ${params.method} ${params.url} qs:${JSON.stringify(params.qs)} body: ${body}`);
					return reject(new Error(`brightcove client unexpected status code ${res.statusCode}`));
				} else if (res.statusCode === 204) {
					return resolve({});
				}

				const isJson = Client.CONTENT_TYPE_MATCHER.test(res.headers['content-type']);
				if (isJson && _.isString(body)) {
					try {
						body = JSON.parse(body);
					} catch (err) {
						debug(`${res.statusCode} ${params.method} ${params.url} qs:${JSON.stringify(params.qs)} error: JSON parsing error message: ${err.message}`);
						return reject(new Error(
							`brightcove client JSON parsing error ${err.message}`
						));
					}
				} else if (isJson) {
					debug(`${res.statusCode} ${params.method} ${params.url} qs:${JSON.stringify(params.qs)} error: received empty JSON body`);
					return reject(new Error(
						`brightcove client received an empty JSON body`
					));
				} else {
					debug(`${res.statusCode} ${params.method} ${params.url} qs:${JSON.stringify(params.qs)} error: expects content-type to be application/json`);
					return reject(new Error(
						`brightcove client expects content-type to be application/json`
					));
				}

				debug(`${res.statusCode} ${params.method} ${params.url} qs:${JSON.stringify(params.qs)}`);
				return resolve(body);
			});
		});
	}

}

module.exports = Client;

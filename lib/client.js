'use strict';

const Boom = require('boom');
const request = require('request');
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
*/

class Client {
	// args.bus *optional
	// args.clientId *required
	// args.clientSecret *required
	// args.accountId *required
	constructor(args) {
		this.bus = args.bus || null;

		this.clientId = args.clientId;
		this.clientSecret = args.clientSecret;
		this.accountId = args.accountId;
		this.policyKey = args.policyKey;

		debug(`Client.constructor clientId: ${this.clientId}`);
		debug(`Client.constructor clientSecret: ${this.clientSecret}`);
		debug(`Client.constructor accountId: ${this.accountId}`);
		debug(`Client.constructor policyKey: ${this.policyKey}`);

		this.getBasicAuthorization = this.getBasicAuthorization.bind(this);
		this.getBearerAuthorization = this.getBearerAuthorization.bind(this);
		this.getBCOVPolicyAuthorization = this.getBCOVPolicyAuthorization.bind(this);

		this.createPolicyKey = this.createPolicyKey.bind(this);
		this.getAccessToken = this.getAccessToken.bind(this);
		this.getPlaylistCount = this.getPlaylistCount.bind(this);
		this.getPlaylists = this.getPlaylists.bind(this);
		this.getPlaylist = this.getPlaylist.bind(this);
		this.getVideosByPlaylist = this.getVideosByPlaylist.bind(this);
		this.getVideoCountByPlaylist = this.getVideoCountByPlaylist.bind(this);
		this.getVideoCount = this.getVideoCount.bind(this);
		this.getVideos = this.getVideos.bind(this);
		this.getVideo = this.getVideo.bind(this);
	}

	getBasicAuthorization(clientId, clientSecret) {
		const clientAuth = new Buffer(`${clientId}:${clientSecret}`);
		return `Basic ${clientAuth.toString('base64')}`;
	}

	getBearerAuthorization(accessToken) {
		return `Bearer ${accessToken}`;
	}

	getBCOVPolicyAuthorization(policyKey) {
		return `BCOV-Policy ${policyKey}`;
	}

	createPolicyKey(args) {
		args = args || {};
		const accountId = args.accountId || this.accountId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required for getPolicyKey()');
		}

		debug(typeof accountId);
		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'POST',
				baseUrl: Client.POLICY_API_BASE_URL,
				path: `/accounts/${accountId}/policy_keys`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				body: Object.assign({}, args.body, {
					'account-id': accountId
				})
			});

			this.makeRequest(args);
		});
	}

	// args.clientId *optional - Defaults to this.clientId
	// args.clientSecret *optional - Defaults to this.clientSecret
	// args.accessToken *optional - Overrides call to getAccessToken and returns promisified args.accessToken
	getAccessToken(args) {
		args = args || {};
		const accessToken = args.accessToken;

		if (accessToken && typeof accessToken === 'string') {
			return Promise.resolve({
				access_token: accessToken // eslint-disable-line camelcase
			});
		}

		const clientId = args.clientId || this.clientId;
		const clientSecret = args.clientSecret || this.clientSecret;

		if (!clientId || typeof clientId !== 'string') {
			throw new Error('A clientId is required to getAccessToken()');
		}

		if (!clientSecret || typeof clientSecret !== 'string') {
			throw new Error('A clientSecret is required to getAccessToken()');
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

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getPlaylistCount()');
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
		const accountId = args.accountId || this.accountId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getPlaylists()');
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
	// args.playlistId *required - Can be a Video Cloud playlist ID or multiple playlist IDs separated by commas
	getPlaylist(args) {
		args = args || {};
		const accountId = args.accountId || this.accountId;
		const playlistId = args.playlistId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getPlaylist()');
		}

		if (!playlistId || typeof playlistId !== 'string') {
			throw new Error('An playlistId is required to getPlaylist()');
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
	getVideosByPlaylist(args) {
		args = args || {};
		const accountId = args.accountId || this.accountId;
		const playlistId = args.playlistId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getVideosByPlaylist()');
		}

		if (!playlistId || typeof playlistId !== 'string') {
			throw new Error('An playlistId is required to getVideosByPlaylist()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/playlists/${playlistId}/videos`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: {}
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *required
	// args.playlistId *required
	getVideoCountByPlaylist(args) {
		args = args || {};
		const accountId = args.accountId || this.accountId;
		const playlistId = args.playlistId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getVideosByPlaylist()');
		}

		if (!playlistId || typeof playlistId !== 'string') {
			throw new Error('An playlistId is required to getVideosByPlaylist()');
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
		const accountId = args.accountId || this.accountId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getVideoCount()');
		}

		return this.getAccessToken(args).then(auth => {
			args = Object.assign({}, args, {
				method: 'GET',
				baseUrl: Client.CMS_API_BASE_URL,
				path: `/accounts/${accountId}/counts/videos`,
				contentType: Client.DEFAULT_CONTENT_TYPE,
				authorization: this.getBearerAuthorization(auth.access_token),
				query: {}
			});

			return this.makeRequest(args);
		});
	}

	// args.accountId *required
	// args.query *optional - See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-videoGroup-Get_Videos
	getVideos(args) {
		args = args || {};
		const accountId = args.accountId || this.accountId;

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getVideos()');
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

			return this.makeRequest(args);
		});
	}

	// args.policyKey *optional - Defaults to this.policyKey
	// args.accountId *optional - Defaults to this.accountId
	// args.videoId *required - Can be a Video Cloud video ID, multiple IDs separated by commas,
	// 													or a single reference ID (ref:reference_id). See: https://docs.brightcove.com/en/video-cloud/cms-api/references/cms-api/versions/v1/index.html#api-videoGroup-Get_Video_by_ID_or_Reference_ID
	getVideo(args) {
		args = args || {};
		const policyKey = args.policyKey || this.policyKey;
		const accountId = args.accountId || this.accountId;
		const videoId = args.videoId;

		if (!policyKey || typeof policyKey !== 'string') {
			throw new Error('A policyKey is required to getVideo()');
		}

		if (!accountId || typeof accountId !== 'string') {
			throw new Error('An accountId is required to getVideo()');
		}

		if (!videoId || typeof videoId !== 'string') {
			throw new Error('A videoId is required to getVideo()');
		}

		args = Object.assign({}, args, {
			method: 'GET',
			baseUrl: Client.PLAYBACK_API_BASE_URL,
			path: `/accounts/${accountId}/videos/${videoId}`,
			contentType: Client.DEFAULT_CONTENT_TYPE,
			authorization: this.getBCOVPolicyAuthorization(policyKey),
			query: {}
		});

		return this.makeRequest(args);
	}

	makeRequest(args) {
		args = args || {};
		const method = args.method || 'GET';
		const path = args.path;
		const baseUrl = args.baseUrl || Client.CMS_API_BASE_URL;

		const contentType = args.contentType || Client.DEFAULT_CONTENT_TYPE;
		const authorization = args.authorization;

		let body = '';
		if (method === 'POST' && args.body) {
			body = Object.assign({}, args.body);
			body = JSON.stringify(body);
		}

		debug(`args: ${JSON.stringify(args)}`);

		if (!authorization || typeof authorization !== 'string') {
			throw new Error('An authorization header is required to makeRequest()');
		}

		const headers = {
			'authorization': authorization,
			'content-type': contentType
		};
		const qs = Object.assign({}, args.query);
		const url = `${baseUrl}${path}`;

		debug(`makeRequest method: ${method} url: ${url} qs: ${JSON.stringify(qs)}`);

		return Client.request({method, url, qs, headers, body});
	}

	static get OAUTH_BASE_URL() {
		return 'https://oauth.brightcove.com/v3';
	}

	static get CMS_API_BASE_URL() {
		return 'https://cms.api.brightcove.com/v1';
	}

	static get PLAYBACK_API_BASE_URL() {
		return 'https://edge.api.brightcove.com/playback/v1';
	}

	static get POLICY_API_BASE_URL() {
		return 'https://policy.api.brightcove.com/v1';
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

	static request(params) {
		return new Promise((resolve, reject) => {
			request(params, (err, res, body) => {
				if (err) {
					debug(`Client.request error: ${err}`);
					return reject(err);
				}

				if (res.statusCode === 404) {
					debug(`Client.request status: 404`);
					return resolve(null);
				}

				if (!Client.STATUS_CODE_20X_MATCHER.test(res.statusCode)) {
					debug(`Client.request status: ${res.statusCode} body: ${body}`);
					return reject(Boom.create(res.statusCode, res.statusMessage, body));
				}

				const isJson = Client.CONTENT_TYPE_MATCHER.test(res.headers['content-type']);
				if (isJson && typeof body === 'string') {
					try {
						body = JSON.parse(body);
					} catch (err) {
						debug(`Client.request error: JSON parsing error message: ${err.message}`);
						return reject(new Error(
							`brightcove client JSON parsing error ${err.message}`
						));
					}
				} else if (isJson) {
					debug(`Client.request error: received empty JSON body`);
					return reject(new Error(
						`brightcove client received an empty JSON body`
					));
				} else {
					debug(`Client.request error: expects content-type to be application/json`);
					return reject(new Error(
						`brightcove client expects content-type to be application/json`
					));
				}

				return resolve(body);
			});
		});
	}

}

module.exports = Client;

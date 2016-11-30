'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const debug = require('debug')('oddworks:provider:brightcove:fetch-brightcove-video');

module.exports = (bus, client, transform) => {
	return args => {
		debug('fetchBrightcoveVideo');
		const channel = args.channel;
		const secrets = channel.secrets || {};
		const spec = args.spec;
		const videoId = args.videoId;
		const skipScheduleCheck = Boolean(_.get(spec, 'skipScheduleCheck'));

		// allow override of existing provider creds when secrets change
		const creds = Object.create(null);
		if (_.has(secrets, 'brightcove.clientId')) {
			creds.clientId = secrets.brightcove.clientId;
		}

		if (_.has(secrets, 'brightcove.clientSecret')) {
			creds.clientSecret = secrets.brightcove.clientSecret;
		}

		if (_.has(secrets, 'brightcove.accountId')) {
			creds.accountId = secrets.brightcove.accountId;
		}

		const params = Object.assign({videoId, skipScheduleCheck}, creds);
		return client.getVideo(params)
			.then(video => {
				if (video) {
					return Promise.join(video, client.getVideoSources(params), (video, sources) => {
						return transform(spec, video, sources);
					});
				}

				const error = new Error(`Video not found for id "${videoId}"`);
				error.code = 'VIDEO_NOT_FOUND';

				// report VIDEO_NOT_FOUND error
				bus.broadcast({level: 'error'}, {
					spec,
					error,
					code: error.code,
					message: 'video not found'
				});

				return Promise.reject(error);
			});
	};
};

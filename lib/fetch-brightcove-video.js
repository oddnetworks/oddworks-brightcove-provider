'use strict';

const Promise = require('bluebird');

module.exports = (bus, client, transform) => {
	return args => {
		const channel = args.channel;
		const secrets = channel.secrets || {};
		const spec = args.spec;
		const videoId = args.videoId;

		// allow override of existing provider creds when secrets change
		const creds = Object.create(null);
		if (secrets.brightcove && secrets.brightcove.clientId) {
			creds.clientId = secrets.brightcove.clientId;
		}

		if (secrets.brightcove && secrets.brightcove.clientSecret) {
			creds.clientSecret = secrets.brightcove.clientSecret;
		}

		if (secrets.brightcove && secrets.brightcove.accountId) {
			creds.accountId = secrets.brightcove.accountId;
		}

		const params = Object.assign({videoId}, creds);
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

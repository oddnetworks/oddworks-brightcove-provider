'use strict';

const Promise = require('bluebird');
const _ = require('lodash');
const debug = require('debug')('oddworks:provider:brightcove:fetch-brightcove-playlist');

module.exports = (bus, client, transform) => {
	return args => {
		const channel = args.channel;
		const secrets = channel.secrets || {};
		const spec = args.spec;
		let collection = args.collection;
		const playlistId = args.playlistId;
		const skipScheduleCheck = Boolean(_.get(args, 'skipScheduleCheck'));

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

		debug(`fetchBrightcovePlaylist id: ${playlistId}`);

		const params = Object.assign({playlistId}, creds);
		return client.getPlaylist(params)
			.then(playlist => {
				if (playlist) {
					collection = Object.assign({}, collection, transform(spec, playlist));

					return client.getVideosByPlaylist(Object.assign({playlistId, skipScheduleCheck}, creds));
					// NOTE We may need to filter out unfinished videos using `video.state === 'ACTIVE' && video.complete === true`
				}

				const error = new Error(`Playlist not found for id "${playlistId}"`);
				error.code = 'PLAYLIST_NOT_FOUND';

				// report the PLAYLIST_NOT_FOUND error
				bus.broadcast({level: 'error'}, {
					spec,
					error,
					code: error.code,
					message: 'playlist not found'
				});

				// Return a rejection to short circuit the rest of the operation
				return Promise.reject(error);
			})
			.then(videos => {
				if (!_.isEmpty(videos)) {
					return Promise.all(
						videos
							.sort((a, b) => {
								// sort newest to oldest
								const aDate = new Date(a.published_at);
								const bDate = new Date(b.published_at);
								return bDate - aDate;
							}).map(video => {
								const spec = {
									channel: channel.id,
									type: 'videoSpec',
									source: 'brightcove-video',
									video
								};

								if (video.id) {
									spec.id = `spec-brightcove-video-${video.id}`;
								}

								return bus.sendCommand({role: 'catalog', cmd: 'setItemSpec'}, spec);
							})
					);
				}

				return [];
			})
			.then(specs => {
				collection.relationships = collection.relationships || {};

				collection.relationships.entities = {
					data: specs.map(spec => {
						return {
							id: spec.resource,
							type: spec.type.replace(/Spec$/, '')
						};
					})
				};

				return collection;
			});
	};
};

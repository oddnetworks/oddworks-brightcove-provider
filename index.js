'use strict';

const Promise = require('bluebird');
const Client = require('./lib/client');
const defaultVideoTransform = require('./lib/default-video-transform');
const defaultCollectionTransform = require('./lib/default-collection-transform');
const createChannelCache = require('./lib/create-channel-cache');
const fetchBrightcoveVideo = require('./lib/fetch-brightcove-video');
const fetchBrightcovePlaylist = require('./lib/fetch-brightcove-playlist');

const DEFAULTS = {
	collectionTransform: defaultCollectionTransform,
	videoTransform: defaultVideoTransform
};

// options.bus
// options.clientId
// options.clientSecret
// options.accountId
// options.collectionTransform
// options.videoTransform
exports.initialize = options => {
	options = Object.assign({}, DEFAULTS, options || {});

	const bus = options.bus;
	const clientId = options.clientId;
	const clientSecret = options.clientSecret;
	const accountId = options.accountId;
	const role = 'provider';
	const cmd = 'get';

	if (!bus || typeof bus !== 'object') {
		throw new Error('oddworks-brightcove-provider requires an Oddcast Bus');
	}

	const collectionTransform = options.collectionTransform;
	const videoTransform = options.videoTransform;

	const client = new Client({bus, clientId, clientSecret, accountId});

	const getChannel = createChannelCache(bus);

	bus.queryHandler(
		{role, cmd, source: 'brightcove-playlist'},
		exports.createPlaylistHandler(bus, getChannel, client, collectionTransform)
	);

	bus.queryHandler(
		{role, cmd, source: 'brightcove-video'},
		exports.createVideoHandler(bus, getChannel, client, videoTransform)
	);

	return Promise.resolve({
		name: 'brightcove-provider',
		client
	});
};

exports.createPlaylistHandler = (bus, getChannel, client, transform) => {
	const getCollection = fetchBrightcovePlaylist(bus, client, transform);

	// Called from Oddworks core via bus.query
	// Expects:
	//	args.spec.playlist.id
	return args => {
		const spec = args.spec;
		const playlist = spec.playlist || {};
		const playlistId = playlist.uri;
		const channelId = spec.channel;

		if (!playlistId || typeof playlistId !== 'string') {
			throw new Error(
				'brightcove-playlist-provider spec.playlist.id String is required'
			);
		}

		const collection = args.object;

		return getChannel(channelId).then(channel => {
			return getCollection({spec, channel, collection, playlistId});
		});
	};
};

exports.createVideoHandler = (bus, getChannel, client, transform) => {
	const getVideo = fetchBrightcoveVideo(bus, client, transform);

	// Called from Oddworks core via bus.query
	// Expects:
	// args.spec.video
	return args => {
		const spec = args.spec;
		const channelId = spec.channel;
		const video = spec.video || {};
		const videoId = video.id;

		if (!videoId || typeof videoId !== 'string') {
			throw new Error(
				'brightcove-video-provider spec.video.id String is required'
			);
		}

		return getChannel(channelId).then(channel => {
			return getVideo({spec, channel, videoId});
		});
	};
};

// options.clientId *required
// options.clientSecret *required
// options.accountId *required
// options.bus *optional
exports.createClient = options => {
	options = Object.assign({}, DEFAULTS, options || {});

	const bus = options.bus;
	const clientId = options.clientId;
	const clientSecret = options.clientSecret;
	const accountId = options.accountId;

	if (!clientId || typeof clientId !== 'string') {
		throw new Error(
			'oddworks-brightcove-provider requires a Brightcove clientId'
		);
	}

	if (!clientSecret || typeof clientSecret !== 'string') {
		throw new Error(
			'oddworks-brightcove-provider requires a Brightcove clientSecret'
		);
	}

	if (!accountId || typeof accountId !== 'string') {
		throw new Error(
			'oddworks-brightcove-provider requires a Brightcove accountId'
		);
	}

	return new Client({bus, clientId, clientSecret, accountId});
};

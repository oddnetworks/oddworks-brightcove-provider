'use strict';

const Promise = require('bluebird');
const test = require('ava');
const nock = require('nock');

const provider = require('../');
const collectionTransform = require('../lib/default-collection-transform');
const accessTokenResponse = require('./fixtures/get-access-token-response');
const playlistResponse = require('./fixtures/get-playlist-response');
const videosByPlaylistResponse = require('./fixtures/get-videos-by-playlist-response');
const helpers = require('./helpers');

const clientId = 'fake-client-id';
const clientSecret = 'fake-client-secret';
const accountId = 'fake-account-id';

// mock channel fetching function
const channelId = 'fake-channel';
const getChannel = () => {
	return Promise.resolve({
		id: channelId,
		secrets: {
			brightcove: {
				clientId,
				clientSecret,
				accountId
			}
		}
	});
};
const basicAuth = new Buffer(`${clientId}:${clientSecret}`);
const oauthAuthHeader = `Basic ${basicAuth.toString('base64')}`;
const cmsAuthHeader = `Bearer ${accessTokenResponse.access_token}`;

let bus;
let playlistHandler = null;

test.before(() => {
	// mock API calls
	nock(
		'https://oauth.brightcove.com/v3',
		{
			reqheaders: {
				authorization: oauthAuthHeader
			}
		})
		.post('/access_token?grant_type=client_credentials')
		.times(3) // this gets called before most client.get* functions
		.reply(200, accessTokenResponse);
	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/playlists/0000000000000`)
		.reply(200, playlistResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/playlists/0000000000000/videos`)
		.reply(200, videosByPlaylistResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/playlists/12345`)
		.reply(404);
});

test.beforeEach(() => {
	bus = helpers.createBus();

	// mock command for creating a video spec
	bus.commandHandler({role: 'catalog', cmd: 'setItemSpec'}, spec => {
		return Promise.resolve({type: 'videoSpec', resource: `res-brightcove-video-${spec.video.id}`});
	});

	// create client with initial credentials that will be overridden
	const client = provider.createClient({
		clientId: 'foo',
		clientSecret: 'foo',
		accountId: 'foo'
	});

	// create handler
	playlistHandler = provider.createPlaylistHandler(bus, getChannel, client, collectionTransform);
});

test('when Brightcove playlist not found', t => {
	const spec = {
		channel: channelId,
		type: 'collectionSpec',
		id: 'spec-brightcove-playlist-12345',
		playlist: {id: '12345'}
	};

	const obs = new Promise(resolve => {
		bus.observe({level: 'error'}, payload => {
			resolve(payload);
		});
	});

	// t.throws(playlistHandler({spec}), `Playlist not found for id "${spec.playlist.id}`);
	return playlistHandler({spec}).catch(err => {
		return obs.then(event => {
			// test bus event
			t.deepEqual(event.error, {code: 'PLAYLIST_NOT_FOUND'});
			t.is(event.code, 'PLAYLIST_NOT_FOUND');
			t.deepEqual(event.spec, spec);
			t.is(event.message, 'playlist not found');

			// test playlist handler rejection
			t.is(err.message, `Playlist not found for id "${spec.playlist.id}"`);
		});
	});
});

test('when Brightcove playlist found', t => {
	const spec = {
		channel: channelId,
		type: 'collectionSpec',
		id: `spec-brightcove-playlist-${playlistResponse.id}`,
		playlist: {id: playlistResponse.id}
	};

	return playlistHandler({spec})
		.then(res => {
			t.deepEqual(Object.keys(res), [
				'id',
				'title',
				'description',
				'images',
				'relationships'
			]);

			// order by published_at desc (newest to oldest)
			t.is(res.relationships.entities.data[0].id, 'res-brightcove-video-V111111111111');
			t.is(res.relationships.entities.data[1].id, 'res-brightcove-video-V333333333333');
			t.is(res.relationships.entities.data[2].id, 'res-brightcove-video-V222222222222');
			// res-brightcove-video-V444444444444 is not scheduled
			// t.is(res.relationships.entities.data[1].id, 'res-brightcove-video-V444444444444');
		});
});

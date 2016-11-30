'use strict';

const test = require('ava');
const nock = require('nock');
const Promise = require('bluebird');
// const debug = require('debug')('oddworks:provider:brightcove:create-video-handler-test');

const provider = require('../');
const videoTransform = require('../lib/default-video-transform');
const videoResponse = require('./fixtures/get-video-response');
const videoScheduledResponse = require('./fixtures/get-video-scheduled-response');
const videoSourcesResponse = require('./fixtures/get-video-sources-response');
const accessTokenResponse = require('./fixtures/get-access-token-response');
const helpers = require('./helpers');

const clientId = 'fake-client-id';
const clientSecret = 'fake-client-secret';
const accountId = 'fake-account-id';

const type = 'videoSpec';

// mock channel fetching function
const channel = 'fake-channel';
const getChannel = () => {
	return Promise.resolve({
		id: channel,
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
let videoHandler = null;

test.before(() => {
	// mock playback API callsnock(
	nock(
		'https://oauth.brightcove.com/v3',
		{
			reqheaders: {
				authorization: oauthAuthHeader
			}
		})
		.post('/access_token?grant_type=client_credentials')
		.times(6) // this gets called before most client.get* functions
		.reply(200, accessTokenResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/videos/${videoScheduledResponse.id}`)
		.times(2)
		.reply(200, videoScheduledResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/videos/${videoResponse.id}`)
		.reply(200, videoResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/videos/${videoResponse.id}/sources`)
		.reply(200, videoSourcesResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/videos/${videoScheduledResponse.id}/sources`)
		.reply(200, videoSourcesResponse);

	nock(
		'https://cms.api.brightcove.com/v1',
		{
			reqheaders: {
				authorization: cmsAuthHeader
			}
		})
		.get(`/accounts/${accountId}/videos/12345`)
		.reply(404, videoResponse);
});

test.beforeEach(() => {
	bus = helpers.createBus();

	// create client with initial credentials that will be overridden
	const client = provider.createClient({
		clientId: 'foo',
		clientSecret: 'foo',
		accountId: 'foo'
	});

	videoHandler = provider.createVideoHandler(bus, getChannel, client, videoTransform);
});

test('when Brightcove video not found', t => {
	const spec = {
		channel,
		type,
		id: 'spec-brightcove-video-12345',
		video: {id: '12345'}
	};

	const obs = new Promise(resolve => {
		bus.observe({level: 'error'}, payload => {
			resolve(payload);
		});
	});

	return videoHandler({spec}).catch(err => {
		return obs.then(event => {
			// test bus event
			t.deepEqual(event.error, {code: 'VIDEO_NOT_FOUND'});
			t.is(event.code, 'VIDEO_NOT_FOUND');
			t.deepEqual(event.spec, spec);
			t.is(event.message, 'video not found');

			// test video handler rejection
			t.is(err.message, `Video not found for id "${spec.video.id}"`);
		});
	});
});

test('when Brightcove video not scheduled', t => {
	const spec = {
		channel,
		type,
		id: `spec-brightcove-video-${videoScheduledResponse.id}`,
		video: {id: videoScheduledResponse.id}
	};

	const obs = new Promise(resolve => {
		bus.observe({level: 'error'}, payload => {
			resolve(payload);
		});
	});

	return videoHandler({spec}).catch(err => {
		return obs.then(event => {
			// test bus event
			t.deepEqual(event.error, {code: 'VIDEO_NOT_FOUND'});
			t.is(event.code, 'VIDEO_NOT_FOUND');
			t.deepEqual(event.spec, spec);
			t.is(event.message, 'video not found');

			// test video handler rejection
			t.is(err.message, `Video not found for id "${spec.video.id}"`);
		});
	});
});

test('when Brihgtcove video not scheduled, but skipScheduleCheck === true', t => {
	const spec = {
		channel,
		type,
		id: `spec-brightcove-video-${videoScheduledResponse.id}`,
		video: {id: videoScheduledResponse.id},
		skipScheduleCheck: true
	};

	return videoHandler({spec})
		.then(res => {
			const source1 = res.sources[0];
			const source4 = res.sources[3];

			t.deepEqual(Object.keys(res), [
				'id',
				'title',
				'description',
				'images',
				'sources',
				'duration',
				'releaseDate'
			]);

			t.is(res.id, `res-brightcove-video-${videoScheduledResponse.id}`);
			t.is(res.title, videoScheduledResponse.name);
			t.is(res.description, videoScheduledResponse.long_description);

			const poster = videoScheduledResponse.images.poster.sources[1];
			const thumbnail = videoScheduledResponse.images.thumbnail.sources[1];
			t.is(res.images.length, 2);
			t.is(res.images[0].url, poster.src);
			t.is(res.images[1].url, thumbnail.src);
			t.is(res.images[1].height, thumbnail.height);
			t.is(res.images[1].width, thumbnail.width);
			t.is(res.images[1].label, `thumbnail-${thumbnail.width}x${thumbnail.height}`);

			t.is(res.sources.length, 4);

			// sources (first MP4 with https)
			const responseSourceMP4 = videoSourcesResponse.filter(source => {
				return typeof source.src !== 'undefined' && source.src.match(/^https/);
			}).shift();
			const responseSourceHLS = videoSourcesResponse.filter(source => {
				return (typeof source.src !== 'undefined' && typeof source.type !== 'undefined') && source.src.match(/^https/) && source.type.match(/^application\/x-mpegURL/);
			}).pop();

			t.is(source1.url, responseSourceMP4.src);
			t.is(source1.label, `mp4-${responseSourceMP4.width}x${responseSourceMP4.height}`);
			t.is(source1.mimeType, 'video/mp4');
			t.is(source1.width, responseSourceMP4.width);
			t.is(source1.height, responseSourceMP4.height);
			t.is(source1.container, responseSourceMP4.container);
			t.is(source1.maxBitrate, responseSourceMP4.encoding_rate);
			// sources (HLS with https)
			t.is(source4.url, responseSourceHLS.src);
			t.is(source4.label, 'hls');
			t.is(source4.mimeType, responseSourceHLS.type);
			t.is(source4.width, 0);
			t.is(source4.height, 0);
			t.is(source4.container, responseSourceHLS.container);
			t.is(source4.maxBitrate, 0);

			t.is(res.duration, videoScheduledResponse.duration);
			t.is(res.releaseDate, videoScheduledResponse.published_at);
		});
});

test('when Brightcove video found', t => {
	const spec = {
		channel,
		type,
		id: `spec-brightcove-video-${videoResponse.id}`,
		video: {id: videoResponse.id}
	};

	return videoHandler({spec})
		.then(res => {
			const source1 = res.sources[0];
			const source4 = res.sources[3];

			t.deepEqual(Object.keys(res), [
				'id',
				'title',
				'description',
				'images',
				'sources',
				'duration',
				'releaseDate'
			]);

			t.is(res.id, `res-brightcove-video-${videoResponse.id}`);
			t.is(res.title, videoResponse.name);
			t.is(res.description, videoResponse.long_description);

			const poster = videoResponse.images.poster.sources[1];
			const thumbnail = videoResponse.images.thumbnail.sources[1];
			t.is(res.images.length, 2);
			t.is(res.images[0].url, poster.src);
			t.is(res.images[1].url, thumbnail.src);
			t.is(res.images[1].height, thumbnail.height);
			t.is(res.images[1].width, thumbnail.width);
			t.is(res.images[1].label, `thumbnail-${thumbnail.width}x${thumbnail.height}`);

			t.is(res.sources.length, 4);

			// sources (first MP4 with https)
			const responseSourceMP4 = videoSourcesResponse.filter(source => {
				return typeof source.src !== 'undefined' && source.src.match(/^https/);
			}).shift();
			const responseSourceHLS = videoSourcesResponse.filter(source => {
				return (typeof source.src !== 'undefined' && typeof source.type !== 'undefined') && source.src.match(/^https/) && source.type.match(/^application\/x-mpegURL/);
			}).pop();

			t.is(source1.url, responseSourceMP4.src);
			t.is(source1.label, `mp4-${responseSourceMP4.width}x${responseSourceMP4.height}`);
			t.is(source1.mimeType, 'video/mp4');
			t.is(source1.width, responseSourceMP4.width);
			t.is(source1.height, responseSourceMP4.height);
			t.is(source1.container, responseSourceMP4.container);
			t.is(source1.maxBitrate, responseSourceMP4.encoding_rate);
			// sources (HLS with https)
			t.is(source4.url, responseSourceHLS.src);
			t.is(source4.label, 'hls');
			t.is(source4.mimeType, responseSourceHLS.type);
			t.is(source4.width, 0);
			t.is(source4.height, 0);
			t.is(source4.container, responseSourceHLS.container);
			t.is(source4.maxBitrate, 0);

			t.is(res.duration, videoResponse.duration);
			t.is(res.releaseDate, videoResponse.published_at);
		});
});

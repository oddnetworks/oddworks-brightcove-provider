'use strict';

const test = require('ava');
const nock = require('nock');
const Promise = require('bluebird');

const provider = require('../');
const videoTransform = require('../lib/default-video-transform');
const videoResponse = require('./fixtures/get-video-response');
const helpers = require('./helpers');

const clientId = 'fake-client-id';
const clientSecret = 'fake-client-secret';
const accountId = 'fake-account-id';
const policyKey = 'fake-policy-key';

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
				accountId,
				policyKey
			}
		}
	});
};

const bcovPolicyAuthHeader = `BCOV-Policy ${policyKey}`;

let bus;
let videoHandler = null;

test.before(() => {
	// mock playback API calls
	nock(
		'https://edge.api.brightcove.com/playback/v1',
		{
			reqheaders: {
				authorization: bcovPolicyAuthHeader
			}
		})
		.get(`/accounts/${accountId}/videos/V111111111111`)
		.reply(200, videoResponse);

	nock(
		'https://edge.api.brightcove.com/playback/v1',
		{
			reqheaders: {
				authorization: bcovPolicyAuthHeader
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
		accountId: 'foo',
		policyKey: 'foo'
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
			t.is(res.description, videoResponse.description);

			t.is(res.images.length, 2);
			t.is(res.images[0].url, videoResponse.poster_sources[1].src);
			t.is(res.images[1].url, videoResponse.thumbnail_sources[1].src);
			t.is(res.images[1].height, 0);
			t.is(res.images[1].width, 0);
			t.is(res.images[1].label, 'thumbnail');

			t.is(res.sources.length, 4);

			// sources (first MP4 with https)
			const responseSourceMP4 = videoResponse.sources.filter(source => {
				return typeof source.src !== 'undefined' && source.src.match(/^https/);
			}).shift();
			const responseSourceHLS = videoResponse.sources.filter(source => {
				return (typeof source.src !== 'undefined' && typeof source.type !== 'undefined') && source.src.match(/^https/) && source.type.match(/^application\/x-mpegURL/);
			}).pop();

			t.is(source1.url, responseSourceMP4.src);
			t.is(source1.label, `mp4-${responseSourceMP4.width}x${responseSourceMP4.height}`);
			t.is(source1.mimeType, 'video/mp4');
			t.is(source1.width, responseSourceMP4.width);
			t.is(source1.height, responseSourceMP4.height);
			t.is(source1.container, responseSourceMP4.container);
			t.is(source1.maxBitrate, responseSourceMP4.avg_bitrate);
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

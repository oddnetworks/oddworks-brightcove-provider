'use strict';

const test = require('ava');
const sinon = require('sinon');

const provider = require('../');
const defaultVideoTransform = require('../lib/default-video-transform');
const defaultCollectionTransform = require('../lib/default-collection-transform');
const helpers = require('./helpers');

const clientId = 'fake-client-id';
const clientSecret = 'fake-client-secret';
const accountId = 'fake-account-id';
const concurrentRequestLimit = 13;

let bus;
let options;
let result = null;

let createVideoHandlerSpy;
let createPlaylistHandlerSpy;
let queryHandlerSpy;

function videoHandler() {}
function playlistHandler() {}

test.before(() => {
	bus = helpers.createBus();

	createVideoHandlerSpy = sinon.stub(provider, 'createVideoHandler').returns(videoHandler);
	createPlaylistHandlerSpy = sinon.stub(provider, 'createPlaylistHandler').returns(playlistHandler);
	queryHandlerSpy = sinon.spy(bus, 'queryHandler');

	options = {
		bus,
		clientId,
		clientSecret,
		accountId,
		concurrentRequestLimit
	};

	return provider.initialize(options).then(res => {
		result = res;
		return null;
	});
});

test('creates Brightcove client', t => {
	t.plan(5);

	t.truthy(result.client);
	t.is(result.client.clientId, clientId);
	t.is(result.client.clientSecret, clientSecret);
	t.is(result.client.accountId, accountId);
	t.is(result.client.concurrentRequestLimit, concurrentRequestLimit);
});

test('calls createVideoHandler', t => {
	t.plan(2);

	t.true(createVideoHandlerSpy.calledOnce);
	t.true(createVideoHandlerSpy.calledWith(bus, sinon.match.func, result.client, defaultVideoTransform));
});

test('calls createPlaylistHandler', t => {
	t.plan(2);

	t.true(createPlaylistHandlerSpy.calledOnce);
	t.true(createPlaylistHandlerSpy.calledWith(bus, sinon.match.func, result.client, defaultCollectionTransform));
});

test('calls bus.queryHandler', t => {
	t.plan(3);

	t.true(queryHandlerSpy.calledTwice);
	t.deepEqual(queryHandlerSpy.firstCall.args, [
		{role: 'provider', cmd: 'get', source: 'brightcove-playlist'},
		playlistHandler
	]);
	t.deepEqual(queryHandlerSpy.secondCall.args, [
		{role: 'provider', cmd: 'get', source: 'brightcove-video'},
		videoHandler
	]);
});

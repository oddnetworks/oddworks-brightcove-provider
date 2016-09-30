'use strict';

const Promise = require('bluebird');
const yargs = require('yargs');
const Client = require('./lib/client');

const REQUEST_METHODS = Object.create(null);
REQUEST_METHODS.makeRequest = '{}';
REQUEST_METHODS.getAccessToken = '{}';
REQUEST_METHODS.getPlaylistCount = '{"query": "OBJECT"}';
REQUEST_METHODS.getPlaylists = '{"query": "OBJECT"}';
REQUEST_METHODS.getPlaylist = '{"playlistId": "STRING"}';
REQUEST_METHODS.getVideosByPlaylist = '{"playlistId": "STRING"}';
REQUEST_METHODS.getVideoCountByPlaylist = '{"playlistId": "STRING"}';
REQUEST_METHODS.getVideoCount = '{"query": "OBJECT"}';
REQUEST_METHODS.getVideos = '{"query": "OBJECT"}';
REQUEST_METHODS.getVideo = '{"videoId": "STRING"}';
REQUEST_METHODS.getVideoSources = '{"videoId": "STRING"}';

const listCommand = () => {
	console.log('Request methods:');
	console.log('');

	Object.getOwnPropertyNames(Client.prototype).forEach(key => {
		if (REQUEST_METHODS[key]) {
			console.log(`\t${key} --args ${REQUEST_METHODS[key]}`);
		}
	});

	return Promise.resolve(null);
};

const requestCommand = args => {
	const clientId = args.clientId;
	const clientSecret = args.clientSecret;
	const accountId = args.accountId;
	const method = args.method;

	if (!clientId) {
		console.error('A clientId is required (--clientId)');
		return Promise.resolve(null);
	}

	if (!clientSecret) {
		console.error('A clientSecret is required (--clientSecret)');
		return Promise.resolve(null);
	}

	if (!accountId) {
		console.error('An accountId is required (--accountId)');
		return Promise.resolve(null);
	}

	let params;
	try {
		params = JSON.parse(args.args);
	} catch (err) {
		console.error('--args JSON parsing error:');
		console.error(err.message);
		return Promise.resolve(null);
	}

	const client = new Client({clientId, clientSecret, accountId});

	return client[method](params).then(res => {
		console.log(JSON.stringify(res, null, 2));
		return null;
	});
};

exports.main = () => {
	const args = yargs
					.usage('Usage: $0 <command> [options]')
					.command('req', 'Make a vimeo client request', {
						method: {
							alias: 'm',
							default: 'makeRequest',
							describe: 'Use the "list" command to see available methods'
						},
						args: {
							alias: 'a',
							default: '{}',
							describe: 'Arguments object as a JSON string'
						},
						clientId: {
							describe: 'Defaults to env var BRIGHTCOVE_CLIENT_ID'
						},
						clientSecret: {
							describe: 'Defaults to env var BRIGHTCOVE_CLIENT_SECRET'
						},
						accountId: {
							describe: 'Defaults to env var BRIGHTCOVE_ACCOUNT_ID'
						}
					})
					.command('list', 'List vimeo client methods')
					.help();

	const argv = args.argv;
	const command = argv._[0];

	switch (command) {
		case 'list':
			return listCommand();
		case 'req':
			return requestCommand({
				clientId: argv.clientId || process.env.BRIGHTCOVE_CLIENT_ID,
				clientSecret: argv.clientSecret || process.env.BRIGHTCOVE_CLIENT_SECRET,
				accountId: argv.accountId || process.env.BRIGHTCOVE_ACCOUNT_ID,
				method: argv.method,
				args: argv.args
			});
		default:
			console.error('A command argument is required.');
			console.error('Use the --help flag to print out help.');
			return Promise.resolve(null);
	}
};

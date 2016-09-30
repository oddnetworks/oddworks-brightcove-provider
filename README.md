# Oddworks Brightcove Provider

A Brightcove provider plugin for the Oddworks content server.

[![Build Status](https://travis-ci.org/oddnetworks/oddworks-brightcove-provider.svg?branch=master)](https://travis-ci.org/oddnetworks/oddworks-brightcove-provider)

Installation
------------
Install the npm package as a Node.js library:

    npm install --save oddworks-brightcove-provider

For full Brightcove API documentation see [docs.brightcove.com/en/video-cloud/concepts/api-overview/api-overview.html](https://docs.brightcove.com/en/video-cloud/concepts/api-overview/api-overview.html).

Oddworks Server Integration
---------------------------
The Oddworks-Brightcove provider is designed to be integrated with an Oddworks server [catalog](https://github.com/oddnetworks/oddworks/tree/master/lib/services/catalog), specifically as a [provider](https://github.com/oddnetworks/oddworks/tree/master/lib/services/catalog#providers). To initialize the plugin in your server:

```JavaScript
const brightcoveProvider = require('oddworks-brightcove-provider');

// See https://github.com/oddnetworks/oddworks/tree/master/lib/services/catalog#patterns
// for more information regarding an Oddcast Bus.
const bus = createMyOddcastBus();

const options = {
    bus: bus,
    clientId: process.env.BRIGHTCOVE_CLIENT_ID,
    clientSecret: process.env.BRIGHTCOVE_CLIENT_SECRET,
    accountId: process.env.BRIGHTCOVE_ACCOUNT_ID
};

brightcoveProvider.initialize(options).then(provider => {
    console.log('Initialized provider "%s"', provider.name);
}).catch(err => {
    console.error(err.stack || err.message || err);
});
```

The initialization process will attach Oddcast listeners for the following queries:

- `bus.query({role: 'provider', cmd: 'get', source: 'brightcove-video'})`
- `bus.query({role: 'provider', cmd: 'get', source: 'brightcove-playlist'})`

To use them you send Oddcast commands to save a specification object:

```JavaScript
// To create a collection based on a Brightcove playlist:
bus.sendCommand({role: 'catalog', cmd: 'setItemSpec'}, {
    channel: 'abc',
    type: 'collectionSpec',
    source: 'brightcove-playlist',
    playlist: {id: '1234567890'}
});

// To create a video based on a Brightcove video:
bus.sendCommand({role: 'catalog', cmd: 'setItemSpec'}, {
    channel: 'abc',
    type: 'videoSpec',
    source: 'brightcove-video',
    video: {id: '0987654321'}
});
```

#### Transform Functions
This library provides a default transform function for collections and assets. It is fine to use the default, but you can provide your own like this:

```JavaScript
const brightcoveProvider = require('oddworks-brightcove-provider');
const bus = createMyOddcastBus();

const options = {
    bus: bus,
    collectionTransform: myCollectionTransform,
    videoTransform: myVideoTransform
};

brightcoveProvider.initialize(options).then(provider => {
    console.log('Initialized provider "%s"', provider.name);
}).catch(err => {
    console.error(err.stack || err.message || err);
});
```

Your transform functions `myCollectionTransform` and `myVideoTransform` will be called when the `vimeo-collection` and `brightcove-video` have respectively received a response from the Brightcove API.

The `myCollectionTransform` function will be called with 2 arguments: the spec object and the Brightcove API response object for a playlist. The `myVideoTransform` function will be called with 3 arguments: the spec object, the Brightcove API response object for a video, and the Brightcove API response objects for a video's sources.

See `lib/default-collection-transform` and `lib/default-video-transform` for more info.

Brightcove API Client
-----------------
You can create a stand-alone API client outside of the Oddworks provider:

```JavaScript
const brightcoveProvider = require('oddworks-brightcove-provider');

const client = brightcoveProvider.createClient({
    bus: bus,
    clientId: process.env.BRIGHTCOVE_CLIENT_ID,
    clientSecret: process.env.BRIGHTCOVE_CLIENT_SECRET,
    accountId: process.env.BRIGHTCOVE_ACCOUNT_ID
});
```

### Client Methods
All methods return a Promise.

- `client.getAccessToken({})`
- `client.getPlaylistCount({})`
- `client.getPlaylists({})`
- `client.getPlaylist({})`
- `client.getVideosByPlaylist({playlistId})`
- `client.getVideoCountByPlaylist({playlistId})`
- `client.getVideoCount({})`
- `client.getVideos({})`
- `client.getVideo({videoId})`

See `lib/client.js` for more documentation and options.

### Query Strings

Some methods support query strings. Simply provide the `{query}` key a hash of the query strings to use. This is handy for certain endpoints like list endpoints.

List endpoints such as `client.getVideos()` or `client.getPlaylists()` are pageable. The default number of items per page is `20`. If your account contains more than 25 videos or playlists, you will need to pass `query` params in order to fetch the rest of your data. Use the methods `client.getPlaylistCount()` and `client.getVideoCount()` to know how many results are available.

Example:

```JavaScript
const query = {
  limit: 20,
  offset: 20
};

client
  .playlists({query})
  .then(res => {
    console.log(JSON.stringify(res, null, 2));
  });
```

Command Line Interface
----------------------
You can interact with the Brightcove client using the CLI tool. To get started, run:

    bin/brightcove --help

To authenticate the API you'll need to export the following environment variables:

- `BRIGHTCOVE_CLIENT_ID` The Brightcove API client ID
- `BRIGHTCOVE_CLIENT_SECRET` The Brightcove API client secret (see: [docs.brightcove.com/en/video-cloud/oauth-api/reference/versions/v4](https://docs.brightcove.com/en/video-cloud/oauth-api/reference/versions/v4)).
- `BRIGHTCOVE_ACCOUNT_ID` The Brightcove account ID. Required for all methods aside from `getAccessToken`

To get help with commands:

    bin/brightcove list --help
    bin/brightcove req --help

License
-------
Apache 2.0 © [Odd Networks](http://oddnetworks.com)

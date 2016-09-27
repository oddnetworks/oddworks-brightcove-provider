'use strict';

module.exports = (spec, playlist) => {
	return {
		id: `res-brightcove-playlist-${playlist.id}`,
		title: playlist.name,
		description: playlist.description,
		images: []
	};
};

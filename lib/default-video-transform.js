'use strict';

const HTTPS_MATCHER = /^https/;
const MP4_MATCHER = /MP4/i;
const TYPE_MATCHER = /application\/x-mpegURL/;

const formatImages = video => {
	const images = [];

	const videoImages = {
		poster: video.images.poster || [],
		thumbnail: video.images.thumbnail || []
	};

	(videoImages.poster.sources || [])
		.filter(image => {
			return HTTPS_MATCHER.test(image.src);
		})
		.forEach(image => {
			images.push({
				url: image.src,
				height: image.height,
				width: image.width,
				label: `poster-${image.width}x${image.height}`
			});
		});

	(videoImages.thumbnail.sources || [])
		.filter(image => {
			return HTTPS_MATCHER.test(image.src);
		})
		.forEach(image => {
			images.push({
				url: image.src,
				height: image.height,
				width: image.width,
				label: `thumbnail-${image.width}x${image.height}`
			});
		});

	return images;
};

const formatSources = sources => {
	const getMimeType = source => {
		if (source.type) {
			return source.type;
		} else if (MP4_MATCHER.test(source.container)) {
			return 'video/mp4';
		}

		return '';
	};

	const getLabel = (source, index) => {
		if (MP4_MATCHER.test(source.container)) {
			return `mp4-${source.width}x${source.height}`;
		} else if (TYPE_MATCHER.test(source.type)) {
			return 'hls';
		}

		return source.asset_id || index;
	};

	return sources
		.filter(source => {
			return typeof source.src !== 'undefined' && HTTPS_MATCHER.test(source.src);
		})
		.map((source, index) => {
			const mimeType = getMimeType(source);
			const label = getLabel(source, index);
			return {
				url: source.src,
				container: source.container,
				mimeType,
				width: source.width || 0,
				height: source.height || 0,
				maxBitrate: source.encoding_rate || 0,
				label: label
			};
		});
};

module.exports = (spec, video, sources) => {
	return {
		id: `res-brightcove-video-${video.id}`,
		title: video.name || '',
		description: video.long_description || video.description || '',
		images: formatImages(video),
		sources: formatSources(sources),
		duration: video.duration || 0,
		releaseDate: video.published_at || null
	};
};

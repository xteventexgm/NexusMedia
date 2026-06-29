const axios = require('axios');
const config = require('../config/env');

let tmdbApi = null;

function getTmdbApi() {
    if (!config.tmdbReadToken) return null;
    if (!tmdbApi) {
        tmdbApi = axios.create({
            baseURL: 'https://api.themoviedb.org/3',
            timeout: config.httpTimeoutMs,
            headers: {
                Authorization: `Bearer ${config.tmdbReadToken}`,
                'Content-Type': 'application/json;charset=utf-8'
            }
        });
    }
    return tmdbApi;
}

function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/ver|pelicula|completa|sub|español|latino|hd|online/gi, '')
        .replace(/\(\d{4}\)/g, '')
        .trim();
}

async function searchTMDB(title) {
    const api = getTmdbApi();
    if (!api || !title) return null;
    try {
        const query = cleanTitle(title);
        const { data } = await api.get('/search/multi', {
            params: { query, language: 'es-ES', page: 1 }
        });
        if (data.results && data.results.length > 0) {
            const valid = data.results.find(r => r.media_type === 'movie' || r.media_type === 'tv');
            return valid || data.results[0];
        }
    } catch (e) {
        console.error('[TMDB] Error searching for:', title, e.message);
    }
    return null;
}

async function enrichItems(items) {
    if (!items || !Array.isArray(items)) return items;
    if (!getTmdbApi()) return items;

    const enriched = await Promise.all(items.map(async (item) => {
        if (item.provider === 'animeflv' || item.provider === 'jkanime' || item.provider === 'monoschinos') {
            return item;
        }

        const tmdbData = await searchTMDB(item.titulo);
        if (tmdbData) {
            return {
                ...item,
                poster: tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : item.poster,
                backdrop: tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : null,
                sinopsis: tmdbData.overview || item.sinopsis || '',
                tmdbRating: tmdbData.vote_average
            };
        }
        return item;
    }));
    return enriched;
}

async function enrichDetails(detalles, providerId) {
    if (providerId === 'animeflv' || providerId === 'jkanime' || providerId === 'monoschinos') {
        return detalles;
    }
    if (!getTmdbApi()) return detalles;

    const tmdbData = await searchTMDB(detalles.titulo);
    if (tmdbData) {
        detalles.poster = tmdbData.poster_path ? `https://image.tmdb.org/t/p/w500${tmdbData.poster_path}` : detalles.poster;
        detalles.backdrop = tmdbData.backdrop_path ? `https://image.tmdb.org/t/p/original${tmdbData.backdrop_path}` : null;
        if (!detalles.sinopsis || detalles.sinopsis.length < 20) {
            detalles.sinopsis = tmdbData.overview || detalles.sinopsis;
        }
        detalles.calificacion = tmdbData.vote_average ? `${tmdbData.vote_average.toFixed(1)}/10` : detalles.calificacion;
        detalles.año = tmdbData.release_date ? tmdbData.release_date.substring(0,4) : 
                       (tmdbData.first_air_date ? tmdbData.first_air_date.substring(0,4) : detalles.año);
    }
    return detalles;
}

module.exports = { enrichItems, enrichDetails };

const axios = require('axios');

const TMDB_API_KEY = '942fbea1cdb136df47a84824b2561ea0';
const TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI5NDJmYmVhMWNkYjEzNmRmNDdhODQ4MjRiMjU2MWVhMCIsIm5iZiI6MTc2NDk3OTI3Ni45MTYsInN1YiI6IjY5MzM3MjRjNjc2NTEyNjQ1NzI0MzQzZCIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.vqJhdQxn8Hu0fXK8XlBcgAbDxPeZ_oKoPnL6MWmYg5U';

const tmdbApi = axios.create({
    baseURL: 'https://api.themoviedb.org/3',
    headers: {
        Authorization: `Bearer ${TMDB_TOKEN}`,
        'Content-Type': 'application/json;charset=utf-8'
    }
});

function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/ver|pelicula|completa|sub|español|latino|hd|online/gi, '')
        .replace(/\(\d{4}\)/g, '')
        .trim();
}

async function searchTMDB(title) {
    if (!title) return null;
    try {
        const query = cleanTitle(title);
        const { data } = await tmdbApi.get('/search/multi', {
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
    
    const enriched = await Promise.all(items.map(async (item) => {
        // No enriquecemos anime porque TMDB no siempre tiene buen anime, Jkanime es mejor.
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

class ProviderBase {
    constructor() {
        this.id = 'base';
        this.nombre = 'Desconocido';
        // Identidad visual opcional (la interfaz la usa para iconos y colores).
        // Cada extensión puede sobreescribir estos valores en su constructor.
        this.icono = '📺';
        this.color = '#e50914';
    }

    async getCatalogo(filtros, page) { throw new Error("getCatalogo no implementado en " + this.nombre); }
    async buscar(query) { throw new Error("buscar no implementado en " + this.nombre); }

    // Opcional: contenido "popular/tendencias" según la propia web de la extensión.
    // Devuelve null si la fuente no expone un orden de popularidad.
    async getPopulares(page) { return null; }
    async getDetalles(urlPath) { throw new Error("getDetalles no implementado en " + this.nombre); }
    async getEnlaces(urlEpisodio) { throw new Error("getEnlaces no implementado en " + this.nombre); }
}

module.exports = ProviderBase;
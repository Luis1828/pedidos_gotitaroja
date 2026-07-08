(function () {
  const params = new URLSearchParams(window.location.search);
  const saved = localStorage.getItem('gr_api_base_url');
  const query = params.get('api');
  const base = query || saved || (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:3000/api';
  window.APP_CONFIG = {
    API_BASE_URL: base,
    APP_NAME: 'Gotita Roja'
  };
})();

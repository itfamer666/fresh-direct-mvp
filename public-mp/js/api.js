// =====================================================================
// API client for the mobile mini-program
// =====================================================================
const API = (function() {
  const BASE = '/api';

  function getToken() {
    try { return localStorage.getItem('xzd_mp_token') || ''; } catch (e) { return ''; }
  }
  function setToken(t) { try { localStorage.setItem('xzd_mp_token', t); } catch (e) {} }
  function clearToken() { try { localStorage.removeItem('xzd_mp_token'); } catch (e) {} }

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch(BASE + path, Object.assign({ headers }, options));
    if (res.status === 401) {
      clearToken();
      throw new Error('登录已过期');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || '请求失败');
    return data;
  }

  return {
    getToken, setToken, clearToken,
    login: (phone, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
    me: () => request('/auth/me'),
    listProducts: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/products' + (q ? '?' + q : ''));
    },
    getProduct: (id) => request('/products/' + id),
    listOrders: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/orders' + (q ? '?' + q : ''));
    },
    createOrder: (data) => request('/orders', { method: 'POST', body: JSON.stringify(data) }),
    payOrder: (id) => request(`/orders/${id}/pay`, { method: 'POST' }),
    confirmOrder: (id) => request(`/orders/${id}/confirm`, { method: 'POST' }),
    cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),
    removeOrder: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
    myCommissions: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/commissions' + (q ? '?' + q : ''));
    },
    meOverview: () => request('/me/overview'),
  };
})();

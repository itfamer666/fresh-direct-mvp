// =====================================================================
// API client for the admin PC console
// =====================================================================
const API = (function() {
  const BASE = '/api';

  function getToken() {
    try { return localStorage.getItem('xzd_admin_token') || ''; } catch (e) { return ''; }
  }
  function setToken(t) {
    try { localStorage.setItem('xzd_admin_token', t); } catch (e) {}
  }
  function clearToken() {
    try { localStorage.removeItem('xzd_admin_token'); } catch (e) {}
  }

  async function request(path, options = {}) {
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      options.body ? {} : {},
      options.headers || {}
    );
    const token = getToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let res;
    try {
      res = await fetch(BASE + path, Object.assign({ headers }, options));
    } catch (e) {
      // 网络层失败：代理不通 / 服务未启动 / 请求被拦截
      throw new Error('网络连接失败：无法访问服务（' + BASE + path + '），请确认通过预览面板访问且服务已启动');
    }
    if (res.status === 401) {
      clearToken();
      throw new Error('登录已过期');
    }
    let data = {};
    try { data = await res.json(); } catch (e) { /* 非 JSON 响应（如代理错误页） */ }
    if (!res.ok) {
      const msg = data.message || data.error;
      if (!msg && res.status === 404) throw new Error('接口不存在：' + BASE + path + '（当前访问地址可能未代理到服务）');
      if (!msg) throw new Error('请求失败（HTTP ' + res.status + '），响应不是有效 JSON');
      throw new Error(msg);
    }
    if (!data || typeof data !== 'object') throw new Error('服务返回格式异常（HTTP ' + res.status + '）');
    return data;
  }

  return {
    getToken, setToken, clearToken,
    // Auth
    login: (phone, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ phone, password }) }),
    me: () => request('/auth/me'),
    // Products
    listProducts: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/products' + (q ? '?' + q : ''));
    },
    toggleProduct: (id) => request(`/products/${id}/toggle-active`, { method: 'POST' }),
    adjustStock: (id, delta) => request(`/products/${id}/stock`, { method: 'POST', body: JSON.stringify({ delta }) }),
    createProduct: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id, data) => request(`/products/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    // Orders
    listOrders: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/orders' + (q ? '?' + q : ''));
    },
    shipOrder: (id) => request(`/orders/${id}/ship`, { method: 'POST' }),
    confirmOrder: (id) => request(`/orders/${id}/confirm`, { method: 'POST' }),
    cancelOrder: (id) => request(`/orders/${id}/cancel`, { method: 'POST' }),
    // Admin
    listUsers: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/users' + (q ? '?' + q : ''));
    },
    listPartners: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/partners' + (q ? '?' + q : ''));
    },
    togglePartner: (id) => request(`/users/${id}/toggle-partner`, { method: 'POST' }),
    createUser: (data) => request('/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) => request(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    listCommissions: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request('/commissions' + (q ? '?' + q : ''));
    },
    settleCommission: (id) => request(`/commissions/${id}/settle`, { method: 'POST' }),
    dashboard: () => request('/stats/dashboard'),
  };
})();

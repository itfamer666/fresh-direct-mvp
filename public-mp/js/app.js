// =====================================================================
// Mobile / Mini-program Vue 3 app
// =====================================================================
const { createApp, ref, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
  setup() {
    // -- State ---------------------------------------------------------
    const auth = ref({ token: API.getToken(), user: null });

    const loginForm = ref({ phone: '139****5678', password: '123456' });
    const loginLoading = ref(false);

    const currentPage = ref('home');
    const tabbarActive = ref('home');
    const showBack = ref(false);

    const products = ref([]);
    const categories = ref(['全部']);
    const category = ref('全部');
    const orders = ref([]);
    const orderTab = ref('all');
    const qty = ref(1);
    const currentProductId = ref(null);
    const currentOrderId = ref(null);
    const partnerInfo = ref(null);
    const paying = ref(false);
    const showShare = ref(false);
    const shareOptions = [
      { name: '微信好友', icon: 'wechat' },
      { name: '朋友圈', icon: 'wechat' },
      { name: '复制链接', icon: 'link-o' },
    ];

    // -- Computed ------------------------------------------------------
    const currentProduct = computed(() =>
      currentProductId.value ? products.value.find(p => p.id === currentProductId.value) : null
    );
    const currentOrder = computed(() =>
      currentOrderId.value ? orders.value.find(o => o.id === currentOrderId.value) : null
    );
    const filteredProducts = computed(() => {
      if (category.value === '全部') return products.value;
      return products.value.filter(p => p.category === category.value);
    });
    const filteredOrders = computed(() => {
      const list = orderTab.value === 'all' ? orders.value : orders.value.filter(o => o.status === orderTab.value);
      // 列表按时间倒序：最新订单在前
      return [...list].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    });
    const orderStats = computed(() => ({
      pending: orders.value.filter(o => o.status === 'pending_pay').length,
      shipping: orders.value.filter(o => ['paid', 'shipped'].includes(o.status)).length,
      done: orders.value.filter(o => o.status === 'delivered').length,
    }));
    function onOrderTabChange(name) {
      orderTab.value = name;
    }
    const pageTitle = computed(() => ({
      home: '鲜直达 · 助农优选',
      product: '商品详情',
      checkout: '确认订单',
      payment: '支付订单',
      orders: '我的订单',
      logistics: '物流跟踪',
      profile: '个人中心',
      partner: '社区合伙人',
    }[currentPage.value] || '鲜直达'));

    // -- Actions -------------------------------------------------------
    async function doLogin() {
      loginLoading.value = true;
      try {
        const r = await API.login(loginForm.value.phone, loginForm.value.password);
        API.setToken(r.token);
        auth.value = { token: r.token, user: r.user };
        vant.showSuccessToast('登录成功');
        await loadAll();
      } catch (e) {
        vant.showFailToast(e.message);
      } finally {
        loginLoading.value = false;
      }
    }

    function logout() {
      API.clearToken();
      auth.value = { token: '', user: null };
      location.reload();
    }

    async function onSwitchUser() {
      try {
        const action = await vant.showActionSheet({
          title: '切换演示身份',
          actions: [
            { name: '王芳（合伙人）', subname: '139****5678' },
            { name: '小张（普通用户）', subname: '138****1234' },
          ],
        });
        const phones = ['139****5678', '138****1234'];
        const r = await API.login(phones[action.index], '123456');
        API.setToken(r.token);
        auth.value = { token: r.token, user: r.user };
        await loadAll();
        vant.showSuccessToast('已切换到 ' + r.user.name);
      } catch (e) { /* cancelled */ }
    }

    function go(page, params = {}) {
      currentPage.value = page;
      if (params.productId) currentProductId.value = params.productId;
      if (params.orderId)   currentOrderId.value   = params.orderId;
      showBack.value = !['home', 'orders', 'profile', 'partner'].includes(page);
      tabbarActive.value = ['home', 'orders', 'partner', 'profile'].includes(page) ? page : tabbarActive.value;
      if (page === 'orders') loadOrders();
      if (page === 'partner') loadPartner();
      if (page === 'profile') loadOrders();
      if (page === 'home') loadProducts();
    }
    function goBack() { go(tabbarActive.value || 'home'); }
    function onTabbarChange(name) {
      if (name === 'partner' && !auth.value.user?.is_partner) {
        vant.showToast('该用户不是合伙人');
        return;
      }
      go(name);
    }
    function onCategoryChange(name) { category.value = name; }
    function goProduct(id) { qty.value = 1; go('product', { productId: id }); }
    function goCheckout() { go('checkout'); }
    function goPayment() { go('payment'); }
    function goLogistics(o) { go('logistics', { orderId: o.id }); }

    async function loadAll() {
      await Promise.all([loadProducts(), loadOrders()]);
      if (auth.value.user?.is_partner) loadPartner();
    }
    async function loadProducts() {
      try {
        const r = await API.listProducts({ active: 'true' });
        products.value = r.products;
        const cats = ['全部', ...new Set(products.value.map(p => p.category))];
        if (!cats.includes(category.value)) category.value = '全部';
        categories.value = cats;
      } catch (e) { console.error(e); }
    }
    async function loadOrders() {
      try { orders.value = (await API.listOrders({ mine: '1' })).orders; } catch (e) { console.error(e); }
    }
    async function loadPartner() {
      try { partnerInfo.value = await API.meOverview(); } catch (e) { console.error(e); }
    }

    async function addToCart() {
      try {
        await API.createOrder({
          productId: currentProductId.value,
          qty: 1,
          address: '上海市浦东新区世纪大道 100 号',
          source: auth.value.user.is_partner ? 'partner' : 'direct',
          partnerId: auth.value.user.is_partner ? auth.value.user.id : null,
        });
        vant.showSuccessToast('订单已创建');
        await loadAll();
        go('orders');
      } catch (e) { vant.showFailToast(e.message); }
    }

    async function payOrder(o) {
      try {
        await API.payOrder(o.id);
        vant.showSuccessToast('支付成功');
        await loadAll();
      } catch (e) { vant.showFailToast(e.message); }
    }
    async function cancelOrder(o) {
      try {
        await vant.showConfirmDialog({ title: '取消订单', message: `确认取消「${o.productName}」订单？` });
        await API.cancelOrder(o.id);
        vant.showSuccessToast('已取消');
        await loadAll();
      } catch (e) { /* cancelled */ }
    }
    async function removeOrder(o) {
      try {
        await vant.showConfirmDialog({ title: '删除订单', message: `确认删除订单 ${o.id}？删除后不可恢复。` });
        await API.removeOrder(o.id);
        vant.showSuccessToast('已删除');
        await loadAll();
      } catch (e) { /* cancelled */ }
    }
    async function confirmOrder(o) {
      try {
        await vant.showConfirmDialog({ title: '确认收货', message: '确认已收到商品？确认后佣金将自动结算。' });
        await API.confirmOrder(o.id);
        vant.showSuccessToast('已签收');
        await loadAll();
      } catch (e) { /* cancelled */ }
    }

    async function confirmPay() {
      paying.value = true;
      try {
        await API.createOrder({
          productId: currentProductId.value,
          qty: qty.value,
          address: '上海市浦东新区世纪大道 100 号',
          source: auth.value.user.is_partner ? 'partner' : 'direct',
          partnerId: auth.value.user.is_partner ? auth.value.user.id : null,
        });
        // Note: server creates order as 'paid' directly (simulating successful payment)
        vant.showSuccessToast('支付成功！');
        await loadAll();
        setTimeout(() => go('orders'), 600);
      } catch (e) {
        vant.showFailToast(e.message);
      } finally {
        paying.value = false;
      }
    }

    function onShareSelect(opt) {
      vant.showSuccessToast('已分享到' + opt.name);
      showShare.value = false;
    }

    function formatTime(t) {
      if (!t) return '-';
      return t.replace('T', ' ').slice(0, 16);
    }

    // -- Lifecycle -----------------------------------------------------
    onMounted(async () => {
      if (auth.value.token) {
        try {
          const r = await API.me();
          auth.value.user = r.user;
          await loadAll();
        } catch (e) {
          API.clearToken();
          auth.value = { token: '', user: null };
        }
      }
    });

    const exported = {
      auth, loginForm, loginLoading, doLogin, logout, onSwitchUser,
      currentPage, tabbarActive, showBack, pageTitle,
      go, goBack, goProduct, goCheckout, goPayment, goLogistics, onTabbarChange,
      categories, category, products, filteredProducts, onCategoryChange,
      currentProduct, currentOrder, qty, showShare, shareOptions, onShareSelect,
      orders, filteredOrders, orderTab, orderStats, partnerInfo,
      paying, confirmPay, payOrder, cancelOrder, removeOrder, confirmOrder, addToCart,
      onOrderTabChange,
      loadProducts, loadOrders, loadPartner,
      formatTime,
    };
    if (typeof window !== 'undefined') {
      window.$mp = exported;
    }
    return exported;
  },
});

app.use(vant);
app.mount('#app');

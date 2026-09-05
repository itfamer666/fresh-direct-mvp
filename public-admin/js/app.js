// =====================================================================
// PC Admin Vue 3 app
// =====================================================================
const { createApp, ref, computed, onMounted, watch, nextTick, h } = Vue;
const { ElMessage, ElMessageBox } = ElementPlus;

const app = createApp({
  setup() {
    // -- State ---------------------------------------------------------
    const auth = ref({ token: API.getToken(), user: null });
    const loginForm = ref({ phone: 'admin', password: 'admin123' });
    const loginLoading = ref(false);

    const activeMenu = ref('dashboard');
    const orderFilter = ref('');
    const orderSource = ref('');
    const orderSearch = ref('');
    const productFilter = ref('');
    const partnerSearch = ref('');
    const commissionFilter = ref('');
    const userSearch = ref('');
    const userRoleFilter = ref('');

    const products = ref([]);
    const orders = ref([]);
    const allOrders = ref([]); // 全量订单（不受订单页 tab 筛选影响），用于用户统计/详情
    const partners = ref([]);
    const commissions = ref([]);
    const users = ref([]);
    const stats = ref(null);

    const detailDrawer = ref({ open: false, order: null });
    const userDetail = ref({ open: false, user: null });

    // Product dialog state
    const productDialog = ref({ open: false, mode: 'create', form: {}, loading: false });
    // Partner/user dialog state
    const userDialog = ref({ open: false, mode: 'create', form: {}, loading: false });

    const productCategories = ref(['水果', '蔬菜', '粮油', '滋补', '坚果', '禽蛋', '茶叶', '其他']);

    // -- Computed ------------------------------------------------------
    const pageTitle = computed(() => ({
      dashboard: '看板概览',
      products: '商品管理',
      orders: '订单管理',
      users: '用户管理',
      partners: '合伙人管理',
      commissions: '佣金管理',
    }[activeMenu.value] || ''));
    const crumbText = computed(() => ({
      dashboard: '首页 · 实时数据',
      products: '商品 · 上下架 · 库存',
      orders: '订单 · 付款 · 发货 · 物流',
      users: '客户 · 注册信息 · 画像',
      partners: '用户 · 合伙人 · 关系链',
      commissions: '佣金 · 结算 · 提现',
    }[activeMenu.value] || ''));

    const filteredProducts = computed(() => {
      if (productFilter.value === 'active') return products.value.filter(p => p.active);
      if (productFilter.value === 'inactive') return products.value.filter(p => !p.active);
      return products.value;
    });
    const filteredOrders = computed(() => {
      let list = orders.value;
      if (orderSource.value) list = list.filter(o => o.source === orderSource.value);
      if (orderSearch.value) {
        const q = orderSearch.value.toLowerCase();
        list = list.filter(o => o.id.toLowerCase().includes(q) || o.userName.toLowerCase().includes(q) || o.productName.toLowerCase().includes(q));
      }
      return list;
    });
    const filteredPartners = computed(() => {
      if (!partnerSearch.value) return partners.value;
      const q = partnerSearch.value.toLowerCase();
      return partners.value.filter(p => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
    });
    const filteredCommissions = computed(() => {
      if (!commissionFilter.value) return commissions.value;
      return commissions.value.filter(c => c.status === commissionFilter.value);
    });
    const filteredUsers = computed(() => {
      let list = users.value.filter(u => u.id !== 'admin'); // 排除管理员账号
      if (userRoleFilter.value === 'partner') list = list.filter(u => u.is_partner);
      if (userRoleFilter.value === 'normal') list = list.filter(u => !u.is_partner);
      if (userSearch.value) {
        const q = userSearch.value.toLowerCase();
        list = list.filter(u =>
          (u.name || '').toLowerCase().includes(q) ||
          (u.id || '').toLowerCase().includes(q) ||
          (u.phone || '').toLowerCase().includes(q)
        );
      }
      return list;
    });

    // -- Actions -------------------------------------------------------
    // 用户订单统计（排除已取消订单）
    function userOrderStats(userId) {
      const list = allOrders.value.filter(o => o.userId === userId && o.status !== 'cancelled');
      return { count: list.length, total: list.reduce((s, o) => s + (o.total || 0), 0) };
    }
    // 用户详情：近期订单（最多 10 条）
    const userDetailOrders = computed(() => {
      const u = userDetail.value.user;
      if (!u) return [];
      return allOrders.value.filter(o => o.userId === u.id).slice(0, 10);
    });
    // 用户详情：上级 / 邀请人
    const userDetailReferrer = computed(() => {
      const u = userDetail.value.user;
      if (!u || !u.parent_id) return '';
      const p = users.value.find(x => x.id === u.parent_id);
      return p ? `${p.name} (${p.id})` : u.parent_id;
    });
    function openUserDetail(u) {
      userDetail.value = { open: true, user: u };
    }

    // 导出当前筛选结果为 CSV（带 BOM，Excel 直接打开不乱码）
    function exportUsers() {
      const rows = filteredUsers.value;
      if (!rows.length) { ElMessage.warning('当前没有可导出的用户'); return; }
      const header = ['用户ID', '昵称', '手机号', '角色', '注册时间', '累计佣金(元)', '订单数', '累计消费(元)'];
      const lines = rows.map(u => {
        const st = userOrderStats(u.id);
        return [
          u.id, u.name, u.phone || '', u.is_partner ? '合伙人' : '普通用户',
          (u.joinedAt || '').slice(0, 10), (u.commissionTotal || 0).toFixed(2),
          st.count, st.total.toFixed(2),
        ].map(v => {
          const s = String(v == null ? '' : v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',');
      });
      const csv = '\uFEFF' + header.join(',') + '\n' + lines.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `用户列表_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      ElMessage.success(`已导出 ${rows.length} 位用户`);
    }

    async function doLogin() {
      if (!loginForm.value.phone || !loginForm.value.password) {
        ElMessage.warning('请输入账号和密码');
        return;
      }
      loginLoading.value = true;
      try {
        const r = await API.login(loginForm.value.phone, loginForm.value.password);
        API.setToken(r.token);
        if (!r.user.is_admin) {
          ElMessage.error('该账号不是管理员');
          API.clearToken();
          return;
        }
        auth.value = { token: r.token, user: r.user };
        ElMessage.success('欢迎回来，' + r.user.name);
        await loadAll();
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        loginLoading.value = false;
      }
    }

    function logout() {
      API.clearToken();
      auth.value = { token: '', user: null };
      location.reload();
    }

    function goMenu(index) {
      activeMenu.value = index;
      nextTick(() => {
        if (index === 'dashboard') drawDashboardCharts();
      });
    }

    async function loadAll() {
      await Promise.all([loadProducts(), loadOrders(), loadAllOrders(), loadPartners(), loadCommissions(), loadUsers(), loadStats()]);
      if (activeMenu.value === 'dashboard') {
        await nextTick();
        drawDashboardCharts();
      }
    }

    async function loadProducts() {
      try { products.value = (await API.listProducts()).products; } catch (e) { console.error(e); }
    }
    async function loadOrders() {
      try {
        const params = {};
        if (orderFilter.value) params.status = orderFilter.value;
        orders.value = (await API.listOrders(params)).orders;
      } catch (e) { console.error(e); }
    }
    async function loadAllOrders() {
      try { allOrders.value = (await API.listOrders()).orders; } catch (e) { console.error(e); }
    }
    async function loadPartners() {
      try { partners.value = (await API.listPartners()).partners; } catch (e) { console.error(e); }
    }
    async function loadUsers() {
      try { users.value = (await API.listUsers()).users; } catch (e) { console.error(e); }
    }
    async function loadCommissions() {
      try { commissions.value = (await API.listCommissions()).commissions; } catch (e) { console.error(e); }
    }
    async function loadStats() {
      try { stats.value = await API.dashboard(); } catch (e) { console.error(e); }
    }
    async function refreshData() {
      ElMessage.info('正在刷新...');
      await loadAll();
      ElMessage.success('已刷新');
    }

    async function adjustStock(p) {
      try {
        const { value } = await ElMessageBox.prompt(`调整「${p.name}」库存（当前 ${p.stock}）`, '调整库存', { inputValue: 10, inputPattern: /^-?\d+$/ });
        const delta = parseInt(value, 10);
        await API.adjustStock(p.id, delta);
        ElMessage.success(`已调整 ${delta > 0 ? '+' : ''}${delta}`);
        await loadProducts();
      } catch (e) { /* cancelled */ }
    }
    async function toggleProduct(p) {
      try {
        await API.toggleProduct(p.id);
        ElMessage.success(p.active ? '已下架' : '已上架');
        await loadProducts();
        await loadStats();
      } catch (e) { ElMessage.error(e.message); }
    }

    // ── Product dialog ─────────────────────────────────────────────
    function openProductCreate() {
      productDialog.value = {
        open: true,
        mode: 'create',
        loading: false,
        form: {
          name: '', subtitle: '', category: '水果', spec: '',
          price: '', original_price: '', stock: '', image: '📦',
          gradient: 'linear-gradient(135deg, #ffb3b3 0%, #ff7a8a 100%)',
          tags: [], description: '', commission_rate: 0.2, active: true,
          image_url: '',
        },
      };
    }
    function openProductEdit(p) {
      productDialog.value = {
        open: true,
        mode: 'edit',
        loading: false,
        form: {
          id: p.id,
          name: p.name, subtitle: p.subtitle || '', category: p.category, spec: p.spec,
          price: p.price, original_price: p.originalPrice, stock: p.stock,
          image: p.image, gradient: p.gradient,
          tags: p.tags || [], description: p.description || '',
          commission_rate: p.commissionRate, active: p.active,
          image_url: p.imageUrl || '',
        },
      };
    }
    // 自定义上传：el-upload 的 :http-request 会把 option 传进来（含 file）
    async function uploadProductImage(option) {
      const fd = new FormData();
      fd.append('file', option.file);
      try {
        const data = await API.uploadFile(fd);
        productDialog.value.form.image_url = data.url;
        ElMessage.success('图片上传成功');
      } catch (e) {
        ElMessage.error(e.message || '图片上传失败');
      }
    }
    function removeProductImage() {
      productDialog.value.form.image_url = '';
    }
    async function saveProduct() {
      const f = productDialog.value.form;
      if (!f.name || !f.price) { ElMessage.warning('请填写商品名称和价格'); return; }
      productDialog.value.loading = true;
      try {
        const payload = {
          name: f.name, subtitle: f.subtitle, category: f.category, spec: f.spec,
          price: Number(f.price), original_price: Number(f.original_price) || Number(f.price),
          stock: Number(f.stock) || 0, image: f.image, gradient: f.gradient,
          tags: Array.isArray(f.tags) ? f.tags : String(f.tags || '').split(/[,，]/).filter(Boolean),
          description: f.description, commission_rate: Number(f.commission_rate) || 0.15,
          active: f.active,
          image_url: f.image_url || null,
        };
        if (productDialog.value.mode === 'create') {
          await API.createProduct(payload);
          ElMessage.success('商品已创建');
        } else {
          await API.updateProduct(f.id, payload);
          ElMessage.success('商品已更新');
        }
        productDialog.value.open = false;
        await loadProducts();
        await loadStats();
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        productDialog.value.loading = false;
      }
    }

    async function shipOrder(o) {
      try {
        await ElMessageBox.confirm(`确认发货「${o.productName}」订单？系统将自动生成运单号。`, '发货', { type: 'warning' });
        await API.shipOrder(o.id);
        ElMessage.success('已发货');
        await loadAll();
      } catch (e) { if (e !== 'cancel') ElMessage.error(e.message); }
    }
    async function confirmOrder(o) {
      try {
        await API.confirmOrder(o.id);
        ElMessage.success('已签收，佣金自动结算');
        await loadAll();
      } catch (e) { ElMessage.error(e.message); }
    }
    function openOrderDetail(o) { detailDrawer.value = { open: true, order: o }; }

    async function togglePartner(u) {
      try {
        await API.togglePartner(u.id);
        ElMessage.success(u.is_partner ? '已取消合伙人' : '已设为合伙人');
        await loadPartners();
        await loadUsers();
        await loadStats();
      } catch (e) { ElMessage.error(e.message); }
    }

    // ── User/Partner dialog ────────────────────────────────────────
    function openUserCreate() {
      userDialog.value = {
        open: true, mode: 'create', loading: false,
        form: { name: '', phone: '', password: '', avatar: '👤', is_partner: true, parent_id: '' },
      };
    }
    function openUserEdit(u) {
      userDialog.value = {
        open: true, mode: 'edit', loading: false,
        form: {
          id: u.id, name: u.name, phone: u.phone, password: '',
          avatar: u.avatar, is_partner: u.is_partner, parent_id: u.parent_id || '',
        },
      };
    }
    async function saveUser() {
      const f = userDialog.value.form;
      if (!f.name || !f.phone) { ElMessage.warning('请填写姓名和手机号'); return; }
      if (userDialog.value.mode === 'create' && !f.password) { ElMessage.warning('请填写初始密码'); return; }
      userDialog.value.loading = true;
      try {
        if (userDialog.value.mode === 'create') {
          await API.createUser({
            name: f.name, phone: f.phone, password: f.password,
            avatar: f.avatar || '👤', is_partner: f.is_partner, parent_id: f.parent_id || null,
          });
          ElMessage.success(f.is_partner ? '合伙人已创建' : '用户已创建');
        } else {
          const payload = {
            name: f.name, phone: f.phone, avatar: f.avatar,
            is_partner: f.is_partner, parent_id: f.parent_id || null,
          };
          if (f.password) payload.password = f.password;
          await API.updateUser(f.id, payload);
          ElMessage.success('信息已更新');
        }
        userDialog.value.open = false;
        await loadPartners();
        await loadUsers();
        await loadStats();
      } catch (e) {
        ElMessage.error(e.message);
      } finally {
        userDialog.value.loading = false;
      }
    }
    async function settleCommission(c) {
      try {
        await ElMessageBox.confirm(`手动结算 ¥${c.amount.toFixed(2)} 佣金给「${c.partnerName}」？`, '手动结算', { type: 'warning' });
        await API.settleCommission(c.id);
        ElMessage.success('已结算');
        await loadAll();
      } catch (e) { if (e !== 'cancel') ElMessage.error(e.message); }
    }

    // -- Charts --------------------------------------------------------
    function drawDashboardCharts() {
      if (!stats.value) return;
      drawGmvChart();
      drawChannelChart();
      drawPartnersChart();
    }
    function drawGmvChart() {
      const el = document.getElementById('chart-gmv');
      if (!el) return;
      const chart = echarts.init(el);
      const days = stats.value.days;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 50, right: 20, top: 20, bottom: 30 },
        xAxis: { type: 'category', data: days.map(d => d.date), axisLine: { lineStyle: { color: '#dde1eb' } } },
        yAxis: { type: 'value', axisLabel: { formatter: '¥{value}' }, splitLine: { lineStyle: { type: 'dashed' } } },
        series: [{
          type: 'line', smooth: true, data: days.map(d => d.gmv),
          areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(44,95,76,0.3)' }, { offset: 1, color: 'rgba(44,95,76,0)' }] } },
          itemStyle: { color: '#2c5f4c' },
          symbol: 'circle', symbolSize: 6,
        }],
      });
    }
    function drawChannelChart() {
      const el = document.getElementById('chart-channel');
      if (!el) return;
      const chart = echarts.init(el);
      const c = stats.value.channel;
      chart.setOption({
        tooltip: { trigger: 'item' },
        legend: { bottom: 0 },
        series: [{
          type: 'pie', radius: ['45%', '70%'], center: ['50%', '45%'],
          data: [
            { name: '直销', value: c.direct.gmv, itemStyle: { color: '#2b6cb0' } },
            { name: '分销', value: c.partner.gmv, itemStyle: { color: '#e57832' } },
          ],
          label: { formatter: '{b}\n{d}%' },
        }],
      });
    }
    function drawPartnersChart() {
      const el = document.getElementById('chart-partners');
      if (!el) return;
      const chart = echarts.init(el);
      const data = stats.value.partnerContribution;
      chart.setOption({
        tooltip: { trigger: 'axis' },
        grid: { left: 80, right: 60, top: 10, bottom: 20 },
        xAxis: { type: 'value', axisLabel: { formatter: '¥{value}' } },
        yAxis: { type: 'category', data: data.map(d => d.name), axisLine: { show: false }, axisTick: { show: false } },
        series: [{
          type: 'bar', data: data.map(d => d.gmv),
          itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: '#2c5f4c' }, { offset: 1, color: '#4cd496' }] }, borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right', formatter: '¥{c}' },
        }],
      });
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
          if (!r.user.is_admin) { API.clearToken(); auth.value = { token: '', user: null }; return; }
          auth.value.user = r.user;
          await loadAll();
        } catch (e) {
          API.clearToken();
          auth.value = { token: '', user: null };
        }
      }
      // Make loaders reactive
      watch(orderFilter, loadOrders);
      watch(productFilter, () => {});
      watch(commissionFilter, () => {});
    });

    const exported = {
      auth, loginForm, loginLoading, doLogin, logout,
      activeMenu, goMenu, pageTitle, crumbText, refreshData,
      orderFilter, orderSource, orderSearch, productFilter, partnerSearch, commissionFilter, userSearch, userRoleFilter,
      products, orders, allOrders, partners, commissions, users, stats,
      filteredProducts, filteredOrders, filteredPartners, filteredCommissions, filteredUsers,
      detailDrawer,
      userDetail, userDetailOrders, userDetailReferrer, openUserDetail, userOrderStats, exportUsers,
      productDialog, productCategories, openProductCreate, openProductEdit, saveProduct,
      uploadProductImage, removeProductImage,
      userDialog, openUserCreate, openUserEdit, saveUser,
      adjustStock, toggleProduct, shipOrder, confirmOrder, openOrderDetail,
      togglePartner, settleCommission,
      formatTime,
      loadProducts, loadOrders, loadAllOrders, loadPartners, loadUsers, loadCommissions, loadStats, loadAll,
    };
    // Expose for browser testing
    if (typeof window !== 'undefined') {
      window.$admin = exported;
      window.$adminApp = { app, ElementPlus, ElementPlusIconsVue, ElMessage, ElMessageBox };
    }
    return exported;
  },
});

// Register Element Plus icons
for (const [key, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, comp);
}
app.use(ElementPlus);
app.mount('#app');

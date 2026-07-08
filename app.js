
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const API = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:3000/api';

const state = {
  token: localStorage.getItem('gr_token') || '',
  user: JSON.parse(localStorage.getItem('gr_user') || 'null'),
  categories: [],
  products: [],
  cart: new Map(),
  selectedCategoryId: null
};

function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  return fetch(`${API}${path}`, { ...opts, headers }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Error de red');
    return data;
  });
}

function fmtMoney(n) {
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB', maximumFractionDigits: 2 }).format(Number(n || 0));
}

function setToken(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('gr_token', token);
  localStorage.setItem('gr_user', JSON.stringify(user));
}

function clearSession() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('gr_token');
  localStorage.removeItem('gr_user');
}

function showView(name) {
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  ['clientView','adminView'].forEach(id => $('#' + id).classList.add('hidden'));
  $('#' + name).classList.remove('hidden');
  $('#authBanner').classList.toggle('hidden', !!state.user);
  $('#authModal').classList.toggle('hidden', !!state.user);
}

function renderCatalog() {
  const categorySelect = $('#categorySelect');
  const productCategorySelect = $('#productCategorySelect');
  const categories = state.categories.filter(c => c.active !== false);
  categorySelect.innerHTML = categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  productCategorySelect.innerHTML = state.categories.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  if (!state.selectedCategoryId && categories[0]) state.selectedCategoryId = String(categories[0].id);
  categorySelect.value = state.selectedCategoryId || categorySelect.value;
  renderProducts();
  renderAdminCatalog();
}

function renderProducts() {
  const wrap = $('#productsWrap');
  const catId = String($('#categorySelect').value);
  state.selectedCategoryId = catId;
  const products = state.products.filter(p => String(p.category_id) === catId && p.active !== false);
  wrap.innerHTML = '';
  if (!products.length) {
    wrap.innerHTML = `<p class="muted">No hay productos activos en esta categoría.</p>`;
    $('#summaryBox').textContent = 'No hay productos para esta categoría.';
    return;
  }
  products.forEach(prod => {
    const tpl = $('#productCardTemplate').content.cloneNode(true);
    const card = tpl.querySelector('.product-card');
    const qtyInput = tpl.querySelector('.qty');
    tpl.querySelector('.product-name').textContent = prod.name;
    tpl.querySelector('.product-desc').textContent = prod.description || 'Sin descripción';
    tpl.querySelector('.price').textContent = `${fmtMoney(prod.price)} · stock ${prod.stock}`;
    tpl.querySelector('.stock-pill').textContent = prod.stock > 0 ? 'Disponible' : 'Sin stock';
    qtyInput.max = prod.stock;
    qtyInput.value = state.cart.get(prod.id)?.quantity || 0;
    if ((state.cart.get(prod.id)?.quantity || 0) > 0) card.classList.add('selected');
    qtyInput.addEventListener('input', (e) => {
      const qty = Math.max(0, Math.min(prod.stock, Number(e.target.value || 0)));
      e.target.value = qty;
      if (qty > 0) {
        state.cart.set(prod.id, { product: prod, quantity: qty });
        card.classList.add('selected');
      } else {
        state.cart.delete(prod.id);
        card.classList.remove('selected');
      }
      updateSummary();
    });
    card.addEventListener('click', (ev) => {
      if (ev.target === qtyInput) return;
      qtyInput.value = qtyInput.value ? 0 : 1;
      qtyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    card.appendChild(qtyInput);
    wrap.appendChild(tpl);
  });
  updateSummary();
}

function updateSummary() {
  const items = [...state.cart.values()];
  const total = items.reduce((a, it) => a + Number(it.product.price) * Number(it.quantity), 0);
  const box = $('#summaryBox');
  if (!items.length) {
    box.textContent = 'Selecciona productos para ver el monto sugerido.';
    return;
  }
  box.innerHTML = `
    <div>
      <strong>${items.length} producto(s)</strong><br/>
      <span class="muted">Monto sugerido de donación: ${fmtMoney(total)}</span>
    </div>`;
}

function renderOrders(orders, target) {
  const list = $(target);
  list.innerHTML = '';
  if (!orders.length) {
    list.innerHTML = '<p class="muted">Sin pedidos por ahora.</p>';
    return;
  }
  orders.forEach(o => {
    const tpl = $('#orderTemplate').content.cloneNode(true);
    const card = tpl.querySelector('.order-card');
    card.dataset.orderId = o.id;
    tpl.querySelector('.order-id').textContent = `Pedido ${o.id.slice(0, 8).toUpperCase()}`;
    tpl.querySelector('.order-meta').textContent = new Date(o.created_at).toLocaleString('es-BO');
    const status = tpl.querySelector('.status-pill');
    status.className = `pill status-pill ${o.status}`;
    status.textContent = o.status.toUpperCase();
    const body = tpl.querySelector('.order-body');
    const items = (o.items || []).map(it => `<li>${escapeHtml(it.name)} × ${it.quantity} — ${fmtMoney(it.subtotal)}</li>`).join('');
    body.innerHTML = `
      <div><b>Cliente:</b> ${escapeHtml(o.user_name)} · ${escapeHtml(o.user_email || o.user_phone || '')}</div>
      <div><b>Categoría:</b> ${escapeHtml(o.category_name)}</div>
      <div><b>Entrega:</b> ${escapeHtml(o.fulfillment_type)}${o.delivery_text ? ` · ${escapeHtml(o.delivery_text)}` : ''}</div>
      <div><b>Contacto:</b> ${escapeHtml(o.contact_method)} · ${escapeHtml(o.contact_value)}</div>
      <div><b>Pedido especial:</b> ${escapeHtml(o.special_request || '—')}</div>
      <div><b>Productos:</b><ul>${items}</ul></div>
      <div><b>Donación / total:</b> ${fmtMoney(o.total_amount)}</div>
      ${o.admin_note ? `<div><b>Comentario admin:</b> ${escapeHtml(o.admin_note)}</div>` : ''}
    `;
    if (o.status === 'approved') tpl.querySelector('.order-qr').classList.remove('hidden');
    if (target === '#adminOrdersList') {
      const controls = document.createElement('div');
      controls.className = 'inline-form';
      controls.style.marginTop = '10px';
      controls.innerHTML = `
        <button class="btn primary" data-action="approve" data-id="${o.id}">Aprobar</button>
        <button class="btn ghost" data-action="review" data-id="${o.id}">Revisar</button>
        <button class="btn ghost" data-action="comment" data-id="${o.id}">Comentar</button>
        <button class="btn ghost" data-action="reject" data-id="${o.id}">Rechazar</button>
        <button class="btn ghost" data-action="delete" data-id="${o.id}">Eliminar</button>`;
      card.appendChild(controls);
    }
    list.appendChild(tpl);
  });
}

function renderAdminCatalog() {
  const catWrap = $('#categoriesAdmin');
  catWrap.innerHTML = '';
  state.categories.forEach(c => {
    const row = document.createElement('div');
    row.className = 'order-card';
    row.innerHTML = `
      <div class="order-top">
        <div>
          <strong>${escapeHtml(c.name)}</strong>
          <p class="small muted">${escapeHtml(c.description || '')}</p>
        </div>
        <span class="pill ${c.active ? 'approved' : 'deleted'}">${c.active ? 'Activa' : 'Inactiva'}</span>
      </div>
      <div class="inline-form" style="margin-top:10px">
        <button class="btn ghost" data-edit="cat">Editar</button>
        <button class="btn ghost" data-toggle="cat">${c.active ? 'Desactivar' : 'Activar'}</button>
      </div>`;
    row.querySelector('[data-edit="cat"]').onclick = () => {
      const name = prompt('Nuevo nombre', c.name);
      if (!name) return;
      const description = prompt('Nueva descripción', c.description || '');
      api(`/admin/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ name, description }) })
        .then(loadAll).catch(alert);
    };
    row.querySelector('[data-toggle="cat"]').onclick = () => {
      api(`/admin/categories/${c.id}`, { method: 'PATCH', body: JSON.stringify({ active: !c.active }) })
        .then(loadAll).catch(alert);
    };
    catWrap.appendChild(row);
  });

  const prodWrap = $('#productsAdmin');
  prodWrap.innerHTML = '';
  state.products.forEach(p => {
    const row = document.createElement('div');
    row.className = 'order-card';
    row.innerHTML = `
      <div class="order-top">
        <div>
          <strong>${escapeHtml(p.name)}</strong>
          <p class="small muted">${escapeHtml(p.description || '')}</p>
        </div>
        <span class="pill ${p.active ? 'approved' : 'deleted'}">${p.active ? 'Activo' : 'Inactivo'}</span>
      </div>
      <div class="small muted">${escapeHtml(getCategoryName(p.category_id))} · ${fmtMoney(p.price)} · stock ${p.stock}</div>
      <div class="inline-form" style="margin-top:10px">
        <button class="btn ghost" data-edit="prod">Editar</button>
        <button class="btn ghost" data-toggle="prod">${p.active ? 'Desactivar' : 'Activar'}</button>
      </div>`;
    row.querySelector('[data-edit="prod"]').onclick = () => fillProductForm(p);
    row.querySelector('[data-toggle="prod"]').onclick = () => {
      api(`/admin/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) })
        .then(loadAll).catch(alert);
    };
    prodWrap.appendChild(row);
  });
}

function getCategoryName(id) {
  return state.categories.find(c => String(c.id) === String(id))?.name || '—';
}

async function loadAll() {
  const [cats, prods] = await Promise.all([api('/catalog/categories'), api('/catalog/products')]);
  state.categories = cats.categories;
  state.products = prods.products;
  renderCatalog();
  if (state.user?.role === 'admin') {
    await loadAdminData();
  } else {
    await loadMyOrders();
  }
}

async function loadMyOrders() {
  if (!state.user) return;
  const data = await api('/orders/my');
  renderOrders(data.orders, '#ordersList');
}

async function loadAdminData() {
  const [orders, metrics] = await Promise.all([api('/admin/orders'), api('/admin/dashboard')]);
  renderOrders(orders.orders, '#adminOrdersList');
  $('#adminMetrics').innerHTML = `
    <div class="metric"><strong>${metrics.metrics.total_orders}</strong><span>Total pedidos</span></div>
    <div class="metric"><strong>${metrics.metrics.pending}</strong><span>Pendientes</span></div>
    <div class="metric"><strong>${metrics.metrics.approved}</strong><span>Aprobados</span></div>
    <div class="metric"><strong>${fmtMoney(metrics.metrics.total_amount)}</strong><span>Donación sugerida</span></div>
  `;
}

function fillProductForm(p) {
  const form = $('#productForm');
  form.id.value = p.id;
  form.categoryId.value = p.category_id;
  form.name.value = p.name;
  form.price.value = p.price;
  form.stock.value = p.stock;
  form.description.value = p.description || '';
  form.active.value = String(!!p.active);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function wireEvents() {
  $$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
    const target = btn.dataset.view;
    if (target === 'adminView' && state.user?.role !== 'admin') {
      alert('Acceso solo para administrador');
      return;
    }
    showView(target);
  }));

  $('#openRegister').onclick = () => { $('#authModal').classList.remove('hidden'); $('#registerForm input[name="name"]').focus(); };
  $('#openLogin').onclick = () => { $('#authModal').classList.remove('hidden'); $('#loginForm input[name="identifier"]').focus(); };

  $('#registerForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api('/auth/register', { method:'POST', body: JSON.stringify(Object.fromEntries(fd)) });
      alert('Cuenta creada. Ahora inicia sesión.');
      e.target.reset();
    } catch (err) { alert(err.message); }
  };

  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      const res = await api('/auth/login', { method:'POST', body: JSON.stringify(fd) });
      setToken(res.token, res.user);
      await loadAll();
      showView(res.user.role === 'admin' ? 'adminView' : 'clientView');
    } catch (err) { alert(err.message); }
  };

  $('#logoutClient').onclick = $('#logoutAdmin').onclick = () => {
    clearSession();
    showView('clientView');
    alert('Sesión cerrada');
  };

  $('#categorySelect').onchange = renderProducts;
  $('#refreshOrders').onclick = loadMyOrders;
  $('#refreshAdminOrders').onclick = loadAdminData;

  $('#fulfillmentType').onchange = () => {
    const delivery = $('#fulfillmentType').value === 'delivery';
    $('#deliveryFields').classList.toggle('hidden', !delivery);
  };

  $('#useGeo').onclick = async () => {
    if (!navigator.geolocation) return $('#geoStatus').textContent = 'Geolocalización no disponible.';
    $('#geoStatus').textContent = 'Solicitando ubicación...';
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      const url = `https://www.google.com/maps?q=${latitude},${longitude}&z=17`;
      orderForm.elements.mapsUrl.value = url;
      orderForm.elements.deliveryText.value = `Ubicación detectada: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
      $('#mapFrame').src = url.replace('www.google.com/maps?q=', 'https://www.google.com/maps?q=');
      $('#geoStatus').textContent = 'Ubicación cargada.';
    }, () => $('#geoStatus').textContent = 'No se pudo obtener ubicación.', { enableHighAccuracy: true, timeout: 12000 });
  };

  const orderForm = $('#orderForm');
  orderForm.elements.mapsUrl.addEventListener('input', syncMap);
  orderForm.elements.mapsUrl.addEventListener('change', syncMap);
  function syncMap() {
    const url = orderForm.elements.mapsUrl.value.trim();
    if (!url) return $('#mapFrame').src = 'about:blank';
    const embed = url.includes('google.com/maps') ? url.replace('/maps', '/maps/embed').replace(/\/place\/?/, '/place/') : `https://www.google.com/maps?q=${encodeURIComponent(url)}`;
    $('#mapFrame').src = embed;
  }

  $('#orderForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const items = [...state.cart.values()].map(it => ({
      productId: it.product.id,
      quantity: it.quantity
    }));
    if (!items.length) return alert('Selecciona al menos un producto.');
    const body = Object.fromEntries(fd);
    body.items = items;
    body.categoryId = Number(body.categoryId);
    try {
      const res = await api('/orders', { method:'POST', body: JSON.stringify(body) });
      alert(`Pedido enviado. ID: ${res.order.id.slice(0,8).toUpperCase()}`);
      state.cart.clear();
      e.target.reset();
      $('#deliveryFields').classList.add('hidden');
      $('#mapFrame').src = 'about:blank';
      await loadMyOrders();
      renderProducts();
    } catch (err) { alert(err.message); }
  };

  $('#categoryForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      await api('/admin/categories', { method:'POST', body: JSON.stringify(fd) });
      e.target.reset();
      await loadAll();
    } catch (err) { alert(err.message); }
  };

  $('#productForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    const payload = {
      categoryId: Number(fd.categoryId),
      name: fd.name,
      price: Number(fd.price),
      stock: Number(fd.stock),
      description: fd.description,
      active: fd.active === 'true'
    };
    try {
      if (fd.id) await api(`/admin/products/${fd.id}`, { method:'PATCH', body: JSON.stringify(payload) });
      else await api('/admin/products', { method:'POST', body: JSON.stringify(payload) });
      e.target.reset();
      await loadAll();
    } catch (err) { alert(err.message); }
  };

  $('#adminOrdersList').addEventListener('click', async (e) => {
    const card = e.target.closest('.order-card');
    if (!card) return;
    const orderId = card.querySelector('.order-id')?.textContent?.replace('Pedido ', '').trim();
    // no-op: buttons are injected server side via render later if desired
  });

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    try {
      if (action === 'approve' || action === 'review' || action === 'reject') {
        const note = prompt('Comentario para el cliente / admin note:', '');
        await api(`/admin/orders/${id}/status`, { method:'PATCH', body: JSON.stringify({ status: action === 'review' ? 'review' : action + 'd', admin_note: note || '' }) });
        await loadAdminData();
      }
      if (action === 'delete') {
        if (!confirm('¿Eliminar este pedido?')) return;
        await api(`/admin/orders/${id}`, { method:'DELETE' });
        await loadAdminData();
      }
      if (action === 'comment') {
        const message = prompt('Comentario para revisión:', '');
        if (!message) return;
        await api(`/admin/orders/${id}/comments`, { method:'POST', body: JSON.stringify({ message }) });
        await api(`/admin/orders/${id}/status`, { method:'PATCH', body: JSON.stringify({ status: 'review', admin_note: message }) });
        await loadAdminData();
      }
    } catch (err) { alert(err.message); }
  });
}

function decorateAdminOrders() {
  // add controls to admin orders list
  $$('#adminOrdersList .order-card').forEach(card => {
    const idText = card.querySelector('.order-id').textContent;
    const short = idText.replace('Pedido ', '');
    const fullId = card.dataset.orderId || short; // fallback
    const controls = document.createElement('div');
    controls.className = 'inline-form';
    controls.style.marginTop = '10px';
    controls.innerHTML = `
      <button class="btn primary" data-action="approve" data-id="${fullId.toLowerCase()}">Aprobar</button>
      <button class="btn ghost" data-action="review" data-id="${fullId.toLowerCase()}">Revisar</button>
      <button class="btn ghost" data-action="comment" data-id="${fullId.toLowerCase()}">Comentar</button>
      <button class="btn ghost" data-action="reject" data-id="${fullId.toLowerCase()}">Rechazar</button>
      <button class="btn ghost" data-action="delete" data-id="${fullId.toLowerCase()}">Eliminar</button>`;
    card.appendChild(controls);
  });
}

async function init() {
  wireEvents();
  if (state.user) {
    showView(state.user.role === 'admin' ? 'adminView' : 'clientView');
    try {
      await loadAll();
    } catch (e) {
      alert('No se pudo conectar al backend: ' + e.message);
    }
  } else {
    showView('clientView');
    $('#authModal').classList.remove('hidden');
  }
  setInterval(async () => {
    if (!state.user) return;
    try {
      if (state.user.role === 'admin') await loadAdminData();
      else await loadMyOrders();
    } catch {}
  }, 20000);
}

init();

const STORE = {
  name: "Elizabeth's",
  sub: "Doceria",
  whatsapp: "556599052036",
  instagram: "https://www.instagram.com/elizabethsdoceria/",
  address: "Rua das Orquídeas, Bairro Paiaguás II — CEP 78048-865",
  cep: "78048865"
};

document.getElementById('heroName').textContent = STORE.name;
document.getElementById('heroSub').textContent = STORE.sub;
document.getElementById('instaLink').href = STORE.instagram;
document.getElementById('footInsta').href = STORE.instagram;
document.getElementById('footWhats').href = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent('Olá! Vim pelo site e gostaria de fazer um pedido')}`;
document.getElementById('customLink').href = `https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent('Olá! Eu queria montar um doce do meu jeito, pode me ajudar?')}`;

let products = [];
let categoriesMeta = [];
let activeCategory = 'Todos';
let cart = [];

let currentDetailProduct = null;
let galleryIndex = 0;
let detailQty = 1;

let checkoutStep = 'cart';
let fulfillmentType = null;
let deliveryMethod = null;
let deliveryDistanceKm = null;
let deliveryFeeComputed = null;
let deliveryCepInput = '';
let deliveryNote = '';
let storeCoords = null;

const productsCol = db.collection('doceria_produtos');
const categoriesCol = db.collection('doceria_categorias');

const seedProducts = [
  {id:'seed1', name:'Bolo de Pote Ninho com Nutella', description:'Camadas de bolo fofinho, creme de ninho e nutella no potinho individual.', price:14, category:'Bolo de Pote', images:[], hidden:false},
  {id:'seed2', name:'Bolo 1kg Chocolate com Morango', description:'Bolo pronto de 1kg, recheado e decorado, ideal para presentear ou comemorar.', price:75, category:'Bolo 1kg Pronto', images:[], hidden:false},
  {id:'seed3', name:'Brownie Recheado de Doce de Leite', description:'Brownie bem molhadinho, recheado com doce de leite cremoso.', price:10, category:'Brownie Recheado', images:[], hidden:false},
  {id:'seed4', name:'Brigadeiro Gourmet', description:'Brigadeiro artesanal enrolado na hora, granulado belga. Ideal para festas.', price:4.5, category:'Brigadeiro (docinho de festa)', images:[], hidden:false},
  {id:'seed5', name:'Bombom Travessa de Ninho', description:'Camadas de bombom cremoso de ninho com chocolate, servido na travessa.', price:60, category:'Bombom Travessa', images:[], hidden:false},
  {id:'seed6', name:'Fatia Duo Chocolate', description:'Duas paixões em uma fatia só: chocolate 50% cacau e muito sabor.', price:18, category:'Bolo Fatia', images:[], hidden:false},
];

async function seedIfEmpty(){
  try{
    const snap = await productsCol.get();
    if(snap.empty){
      await Promise.all(seedProducts.map(p=>{
        const {id, ...data} = p;
        return productsCol.doc(id).set(data);
      }));
    }
  }catch(e){
    console.error('Error seeding initial catalog', e);
  }
}

function startListening(){
  productsCol.onSnapshot((snap)=>{
    products = snap.docs.map(d=>({id:d.id, ...d.data()}));
    render();
  }, (err)=>{
    console.error('Error loading menu in real-time', err);
    document.getElementById('sections').innerHTML = emptyState('Não foi possível carregar o cardápio agora. Recarregue a página.');
  });

  categoriesCol.onSnapshot((snap)=>{
    categoriesMeta = snap.docs
      .map(d=>({name:d.id, order: d.data().order ?? 0, featured: !!d.data().featured}))
      .sort((a,b)=>a.order-b.order);
    render();
  }, (err)=>{
    console.error('Error loading categories', err);
  });
}

async function init(){
  document.getElementById('sections').innerHTML = `<div class="loading">Carregando cardápio...</div>`;
  loadCart();
  renderCartFab();
  await seedIfEmpty();
  startListening();
}

function getCategories(){
  const present = new Set(products.filter(p=>!p.hidden).map(p=>p.category).filter(Boolean));
  const known = categoriesMeta.filter(c=>present.has(c.name)).map(c=>c.name);
  const rest = [...present].filter(n=>!categoriesMeta.some(c=>c.name===n)).sort();
  return [...known, ...rest];
}

function isFeatured(categoryName){
  const c = categoriesMeta.find(c=>c.name===categoryName);
  return !!(c && c.featured);
}

function getProductImages(p){
  return (p && p.images && p.images.length) ? p.images : (p && p.image ? [p.image] : []);
}

function render(){
  renderNav();
  renderSections();
}

function renderNav(){
  const cats = ['Todos', ...getCategories()];
  const nav = document.getElementById('navScroll');
  nav.innerHTML = cats.map(c => `<button class="pill ${c===activeCategory?'active':''}" data-cat="${escapeAttr(c)}">${escapeHtml(c)}</button>`).join('');
  nav.querySelectorAll('.pill').forEach(btn=>{
    btn.onclick = ()=>{ activeCategory = btn.dataset.cat; render(); };
  });
}

function renderSections(){
  const wrap = document.getElementById('sections');
  const cats = activeCategory === 'Todos' ? getCategories() : [activeCategory];
  const visibleTotal = products.filter(p=>!p.hidden).length;

  if(visibleTotal === 0){
    wrap.innerHTML = emptyState('Ainda não há produtos disponíveis. Volte em breve! 🍰');
    return;
  }

  let html = '';
  cats.forEach(cat=>{
    const items = products.filter(p=>p.category===cat && !p.hidden);
    if(items.length===0) return;
    const featured = isFeatured(cat);
    html += `
      <div style="margin-bottom:38px;">
        <div class="section-title">
          <div>
            <h2>${featured?'⭐ ':''}${escapeHtml(cat)}</h2>
            <div class="divider"></div>
          </div>
          <span class="count">${items.length} ${items.length===1?'item':'itens'}</span>
        </div>
        <div class="grid">
          ${items.map(p=>cardHtml(p, featured)).join('')}
        </div>
      </div>`;
  });

  wrap.innerHTML = html || emptyState('Nada por aqui ainda nessa categoria.');

  wrap.querySelectorAll('[data-open]').forEach(el=>{
    el.addEventListener('click', ()=>openProductModal(el.dataset.open));
  });
}

function cardHtml(p, featured){
  const imgs = getProductImages(p);
  return `
    <div class="card${featured?' card-featured':''}" data-open="${p.id}" style="cursor:pointer;">
      <div class="card-img">
        ${imgs[0] ? `<img src="${imgs[0]}" alt="${escapeAttr(p.name)}">` : placeholderIcon()}
        <div class="price-tag">${formatPrice(p.price)}</div>
        ${featured ? '<div class="featured-badge">⭐ Destaque</div>' : ''}
        ${imgs.length>1?`<div style="position:absolute;bottom:8px;right:8px;background:rgba(59,30,74,0.6);color:#fff;font-size:10.5px;padding:3px 8px;border-radius:10px;">📷 ${imgs.length}</div>`:''}
      </div>
      <div class="card-body">
        <span class="type-badge">${escapeHtml(p.category)}</span>
        <h3>${escapeHtml(p.name)}</h3>
        <p>${escapeHtml(p.description||'')}</p>
        <button class="addcart-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
          Ver e adicionar à sacola
        </button>
      </div>
    </div>`;
}

function placeholderIcon(){
  return `<div class="placeholder-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#8a6b96" stroke-width="1.3"><path d="M4 13c0-2.5 3.5-4 8-4s8 1.5 8 4v6H4v-6z"/><path d="M12 9V6M9 6c0-1.5 1-2.5 3-2.5S15 4.5 15 6"/><path d="M4 17h16"/></svg></div>`;
}

function emptyState(msg){
  return `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 13c0-2.5 3.5-4 8-4s8 1.5 8 4v6H4v-6z"/><path d="M4 17h16"/></svg><div>${msg}</div></div>`;
}

function formatPrice(v){
  return Number(v).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function escapeAttr(s){ return escapeHtml(s); }

function openProductModal(id){
  const p = products.find(p=>p.id===id);
  if(!p) return;
  currentDetailProduct = p;
  galleryIndex = 0;
  detailQty = 1;
  renderProductModal();
}

function renderProductModal(){
  const p = currentDetailProduct;
  if(!p) return;
  const imgs = getProductImages(p);
  const root = document.getElementById('modalRoot');
  root.innerHTML = `
    <div class="overlay" id="ov">
      <div class="modal" style="position:relative;">
        <button class="close-x" id="closeDetail">×</button>
        <div class="gallery-main">
          ${imgs.length ? `<img src="${imgs[galleryIndex]}" alt="${escapeAttr(p.name)}">` : placeholderIcon()}
          ${imgs.length>1 ? `
            <button class="gallery-nav prev" id="galPrev">‹</button>
            <button class="gallery-nav next" id="galNext">›</button>
          ` : ''}
        </div>
        ${imgs.length>1 ? `<div class="gallery-thumbs">${imgs.map((src,i)=>`<img src="${src}" class="${i===galleryIndex?'active':''}" data-thumb="${i}">`).join('')}</div>` : ''}
        <span class="type-badge">${escapeHtml(p.category)}</span>
        <h2 style="margin-top:4px;">${escapeHtml(p.name)}</h2>
        <div class="detail-price">${formatPrice(p.price)}</div>
        <div class="detail-desc">${escapeHtml(p.description||'Sem descrição.')}</div>
        <div class="qty-stepper">
          <button id="qtyMinus">−</button>
          <span id="qtyVal">${detailQty}</span>
          <button id="qtyPlus">+</button>
        </div>
        <div class="modal-actions">
          <button class="btn-primary" id="addToCartBtn" style="width:100%;">Adicionar à sacola</button>
        </div>
      </div>
    </div>`;

  document.getElementById('closeDetail').onclick = closeModalRoot;
  document.getElementById('ov').addEventListener('click', e=>{ if(e.target.id==='ov') closeModalRoot(); });

  if(imgs.length>1){
    document.getElementById('galPrev').onclick = ()=>{ galleryIndex=(galleryIndex-1+imgs.length)%imgs.length; renderProductModal(); };
    document.getElementById('galNext').onclick = ()=>{ galleryIndex=(galleryIndex+1)%imgs.length; renderProductModal(); };
    root.querySelectorAll('[data-thumb]').forEach(t=>{ t.onclick = ()=>{ galleryIndex = parseInt(t.dataset.thumb); renderProductModal(); }; });
  }

  document.getElementById('qtyMinus').onclick = ()=>{ if(detailQty>1){ detailQty--; document.getElementById('qtyVal').textContent=detailQty; } };
  document.getElementById('qtyPlus').onclick = ()=>{ detailQty++; document.getElementById('qtyVal').textContent=detailQty; };
  document.getElementById('addToCartBtn').onclick = ()=>{
    addToCart(p, detailQty);
    closeModalRoot();
  };
}

function loadCart(){
  try{
    const raw = localStorage.getItem('doceria_cart_v1');
    cart = raw ? JSON.parse(raw) : [];
  }catch(e){
    cart = [];
  }
}
function saveCart(){
  try{ localStorage.setItem('doceria_cart_v1', JSON.stringify(cart)); }catch(e){}
}

function cartTotal(){ return cart.reduce((s,c)=>s + c.price*c.qty, 0); }
function cartCount(){ return cart.reduce((s,c)=>s + c.qty, 0); }

function addToCart(product, qty){
  const existing = cart.find(c=>c.id===product.id);
  if(existing){
    existing.qty += qty;
  } else {
    cart.push({id:product.id, name:product.name, price:product.price, qty, image: getProductImages(product)[0] || null});
  }
  saveCart();
  renderCartFab();
  toast('Adicionado à sacola! 🛍️');
}

function updateCartQty(id, delta){
  const item = cart.find(c=>c.id===id);
  if(!item) return;
  item.qty += delta;
  if(item.qty <= 0) cart = cart.filter(c=>c.id!==id);
  saveCart();
  renderCartFab();
  renderCartModal();
}

function removeCartItem(id){
  cart = cart.filter(c=>c.id!==id);
  saveCart();
  renderCartFab();
  renderCartModal();
}

function renderCartFab(){
  const wrap = document.getElementById('cartFabWrap');
  if(!wrap) return;
  const count = cartCount();
  wrap.innerHTML = `
    <button class="cart-fab" id="cartFabBtn" title="Ver sacola">
      🛍️
      ${count>0?`<span class="badge">${count}</span>`:''}
    </button>`;
  document.getElementById('cartFabBtn').onclick = ()=>{ checkoutStep='cart'; openCartModal(); };
}

function cartItemHtml(item, readonly){
  return `
    <div class="cart-item">
      ${item.image ? `<img src="${item.image}">` : `<div class="ph">🍰</div>`}
      <div class="ci-info">
        <b>${escapeHtml(item.name)}</b>
        <span>${formatPrice(item.price)} cada</span>
      </div>
      ${readonly ? `<div class="ci-qty"><span>${item.qty}x</span></div>` : `
        <div class="ci-qty">
          <button data-qty-minus="${item.id}">−</button>
          <span>${item.qty}</span>
          <button data-qty-plus="${item.id}">+</button>
        </div>
        <button class="icon-btn del" data-remove="${item.id}" style="margin-left:6px;">🗑</button>
      `}
    </div>`;
}

function openCartModal(){
  renderCartModal();
}

async function ensureStoreCoords(){
  if(storeCoords) return storeCoords;
  try{
    const cached = localStorage.getItem('doceria_store_coords_v1');
    if(cached){ storeCoords = JSON.parse(cached); return storeCoords; }
  }catch(e){}
  try{
    const viacepRes = await fetch(`https://viacep.com.br/ws/${STORE.cep}/json/`);
    const viacepData = await viacepRes.json();
    if(viacepData.erro) return null;
    const q = `${viacepData.logradouro}, ${viacepData.bairro}, ${viacepData.localidade}, ${viacepData.uf}, Brasil`;
    const geo = await geocodeAddressString(q);
    if(geo){
      storeCoords = geo;
      try{ localStorage.setItem('doceria_store_coords_v1', JSON.stringify(geo)); }catch(e){}
    }
  }catch(e){
    console.error('Erro ao localizar o endereço da loja', e);
  }
  return storeCoords;
}

async function geocodeAddressString(q){
  try{
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const data = await res.json();
    if(data && data[0]) return {lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon)};
  }catch(e){
    console.error('Erro ao geocodificar endereço', e);
  }
  return null;
}

function haversineKm(lat1, lon1, lat2, lon2){
  const R = 6371;
  const toRad = d => d*Math.PI/180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function feeFromKm(km){
  if(km<=3) return 6;
  if(km<=5) return 10;
  return 10 + (km-5)*1;
}

async function handleUseGps(){
  if(!navigator.geolocation){ toast('Seu navegador não suporta localização por GPS.'); return; }
  toast('Obtendo sua localização...');
  navigator.geolocation.getCurrentPosition(async (pos)=>{
    const store = await ensureStoreCoords();
    deliveryMethod = 'gps';
    if(!store){
      deliveryDistanceKm = null; deliveryFeeComputed = null;
      renderFulfillmentExtra();
      return;
    }
    const km = haversineKm(store.lat, store.lon, pos.coords.latitude, pos.coords.longitude);
    deliveryDistanceKm = km;
    deliveryFeeComputed = feeFromKm(km);
    renderFulfillmentExtra();
  }, (err)=>{
    console.error('Erro de geolocalização', err);
    toast('Não conseguimos acessar sua localização. Tente pelo CEP.');
  }, {enableHighAccuracy:true, timeout:10000});
}

async function handleUseCep(){
  const cep = deliveryCepInput.replace(/\D/g,'');
  if(cep.length !== 8){ toast('Digite um CEP válido, com 8 números.'); return; }
  toast('Calculando distância...');
  try{
    const viacepRes = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const viacepData = await viacepRes.json();
    if(viacepData.erro){ toast('CEP não encontrado.'); return; }
    const q = `${viacepData.logradouro}, ${viacepData.bairro}, ${viacepData.localidade}, ${viacepData.uf}, Brasil`;
    const [geo, store] = await Promise.all([geocodeAddressString(q), ensureStoreCoords()]);
    deliveryMethod = 'cep';
    if(!geo || !store){
      deliveryDistanceKm = null; deliveryFeeComputed = null;
      renderFulfillmentExtra();
      return;
    }
    const km = haversineKm(store.lat, store.lon, geo.lat, geo.lon);
    deliveryDistanceKm = km;
    deliveryFeeComputed = feeFromKm(km);
    renderFulfillmentExtra();
  }catch(e){
    console.error('Erro ao calcular pelo CEP', e);
    toast('Não foi possível calcular agora. Tente novamente.');
  }
}

function renderCartModal(){
  const root = document.getElementById('modalRoot');

  if(checkoutStep==='cart'){
    root.innerHTML = `
      <div class="overlay" id="ov">
        <div class="modal" style="position:relative;">
          <button class="close-x" id="closeCart">×</button>
          <h2>Sua sacola</h2>
          <div class="sub">Confira os itens antes de fechar o pedido.</div>
          <div>${cart.length ? cart.map(i=>cartItemHtml(i,false)).join('') : '<div class="cart-empty">Sua sacola está vazia 🍰</div>'}</div>
          ${cart.length ? `<div class="cart-total-row"><span>Total</span><span>${formatPrice(cartTotal())}</span></div>` : ''}
          <div class="modal-actions">
            <button class="btn-secondary" id="closeCart2">Continuar comprando</button>
            ${cart.length ? `<button class="btn-primary" id="goFulfillment">Fechar pedido</button>` : ''}
          </div>
        </div>
      </div>`;

    document.getElementById('closeCart').onclick = closeModalRoot;
    document.getElementById('closeCart2').onclick = closeModalRoot;
    document.getElementById('ov').addEventListener('click', e=>{ if(e.target.id==='ov') closeModalRoot(); });
    root.querySelectorAll('[data-qty-minus]').forEach(b=>b.onclick=()=>updateCartQty(b.dataset.qtyMinus, -1));
    root.querySelectorAll('[data-qty-plus]').forEach(b=>b.onclick=()=>updateCartQty(b.dataset.qtyPlus, 1));
    root.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>removeCartItem(b.dataset.remove));
    const goBtn = document.getElementById('goFulfillment');
    if(goBtn) goBtn.onclick = ()=>{ checkoutStep='fulfillment'; renderCartModal(); };

  } else if(checkoutStep==='fulfillment'){
    root.innerHTML = `
      <div class="overlay" id="ov">
        <div class="modal" style="position:relative;">
          <button class="close-x" id="closeCart">×</button>
          <h2>Como você quer receber?</h2>
          <div class="sub">Escolha uma opção pra gente fechar certinho.</div>

          <div class="fulfill-option ${fulfillmentType==='retirada'?'active':''}" data-type="retirada">
            <b>🏠 Retirar na loja</b>
            <span>${STORE.address}</span>
          </div>
          <div class="fulfill-option ${fulfillmentType==='entrega'?'active':''}" data-type="entrega">
            <b>🛵 Entrega</b>
            <span>Calculamos a taxa pela distância até você</span>
          </div>
          <div class="fulfill-option ${fulfillmentType==='combinar'?'active':''}" data-type="combinar">
            <b>💬 A combinar</b>
            <span>Combinamos os detalhes direto no WhatsApp</span>
          </div>

          <div id="fulfillmentExtra"></div>

          <div class="modal-actions">
            <button class="btn-secondary" id="backToCart">Voltar</button>
            <button class="btn-primary" id="goSummary">Continuar</button>
          </div>
        </div>
      </div>`;

    document.getElementById('closeCart').onclick = closeModalRoot;
    document.getElementById('ov').addEventListener('click', e=>{ if(e.target.id==='ov') closeModalRoot(); });
    document.getElementById('backToCart').onclick = ()=>{ checkoutStep='cart'; renderCartModal(); };
    root.querySelectorAll('.fulfill-option').forEach(el=>{
      el.onclick = ()=>{
        fulfillmentType = el.dataset.type;
        renderCartModal();
      };
    });
    renderFulfillmentExtra();

    document.getElementById('goSummary').onclick = ()=>{
      if(!fulfillmentType){ toast('Escolha uma forma de receber o pedido.'); return; }
      if(fulfillmentType==='entrega' && !deliveryMethod){
        toast('Calcule a taxa de entrega usando GPS ou CEP antes de continuar.');
        return;
      }
      checkoutStep='summary'; renderCartModal();
    };

  } else if(checkoutStep==='summary'){
    const fee = fulfillmentType==='entrega' ? deliveryFeeComputed : 0;
    const total = cartTotal() + (fee||0);
    root.innerHTML = `
      <div class="overlay" id="ov">
        <div class="modal" style="position:relative;">
          <button class="close-x" id="closeCart">×</button>
          <h2>Confirmar pedido</h2>
          <div>${cart.map(i=>cartItemHtml(i,true)).join('')}</div>
          <div class="cart-total-row"><span>Subtotal</span><span>${formatPrice(cartTotal())}</span></div>
          ${fulfillmentType==='entrega' ? `<div class="cart-total-row" style="border-top:none;padding-top:2px;"><span>Taxa de entrega${deliveryDistanceKm!=null?` (${deliveryDistanceKm.toFixed(1)} km)`:''}</span><span>${fee!=null?formatPrice(fee):'A confirmar'}</span></div>` : ''}
          <div class="cart-total-row" style="font-size:17px;"><span>Total</span><span>${fee!=null || fulfillmentType!=='entrega' ? formatPrice(total) : formatPrice(cartTotal())+' + taxa'}</span></div>
          <div class="sub" style="margin-top:12px;">
            ${fulfillmentType==='retirada' ? `Retirada: ${escapeHtml(STORE.address)}` : ''}
            ${fulfillmentType==='entrega' ? `Vamos confirmar seu endereço exato pelo WhatsApp na hora da entrega.${deliveryNote?` Observação: ${escapeHtml(deliveryNote)}`:''}` : ''}
            ${fulfillmentType==='combinar' ? `Vamos combinar os detalhes pelo WhatsApp.` : ''}
          </div>
          <div class="modal-actions">
            <button class="btn-secondary" id="backToFulfillment">Voltar</button>
            <button class="btn-primary" id="sendOrderBtn">Enviar pedido pelo WhatsApp</button>
          </div>
        </div>
      </div>`;

    document.getElementById('closeCart').onclick = closeModalRoot;
    document.getElementById('ov').addEventListener('click', e=>{ if(e.target.id==='ov') closeModalRoot(); });
    document.getElementById('backToFulfillment').onclick = ()=>{ checkoutStep='fulfillment'; renderCartModal(); };
    document.getElementById('sendOrderBtn').onclick = ()=>{
      const msg = buildWhatsAppMessage(fee, total);
      window.open(`https://wa.me/${STORE.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank');
      cart = []; saveCart(); renderCartFab();
      fulfillmentType=null; deliveryMethod=null; deliveryDistanceKm=null; deliveryFeeComputed=null; deliveryCepInput=''; deliveryNote='';
      checkoutStep='cart';
      closeModalRoot();
      toast('Pedido enviado! Confirma os detalhes no WhatsApp.');
    };
  }
}

function renderFulfillmentExtra(){
  const wrap = document.getElementById('fulfillmentExtra');
  if(!wrap) return;
  if(fulfillmentType !== 'entrega'){ wrap.innerHTML = ''; return; }

  let resultHtml = '';
  if(deliveryDistanceKm != null && deliveryFeeComputed != null){
    resultHtml = `<div style="background:#faf5fc;border:1px solid #eadcf2;border-radius:10px;padding:12px;margin-top:10px;font-size:13.5px;color:var(--plum);">
      📍 Distância estimada: <b>${deliveryDistanceKm.toFixed(1)} km</b><br>
      Taxa de entrega: <b>${formatPrice(deliveryFeeComputed)}</b>
    </div>`;
  } else if(deliveryMethod){
    resultHtml = `<div style="background:#fff7e6;border:1px solid #f0dfa8;border-radius:10px;padding:12px;margin-top:10px;font-size:13px;color:#8a6d1a;">
      Não conseguimos calcular automaticamente agora — a taxa de entrega será confirmada com você no WhatsApp.
    </div>`;
  }

  wrap.innerHTML = `
    <div class="field">
      <label>Como calcular a taxa de entrega?</label>
      <div style="margin-bottom:8px;">
        <button type="button" class="btn-secondary" id="useGpsBtn" style="width:100%;">📍 Usar minha localização atual (GPS)</button>
      </div>
      <div style="display:flex;gap:8px;">
        <input type="text" id="cepInput" placeholder="Ou digite seu CEP" value="${escapeAttr(deliveryCepInput)}" style="flex:1;padding:10px 12px;border:1px solid #e2d1eb;border-radius:10px;font-family:'Jost',sans-serif;font-size:14px;">
        <button type="button" class="btn-primary" id="useCepBtn" style="flex:0 0 auto;">Calcular</button>
      </div>
      ${resultHtml}
    </div>
    <div class="field" style="margin-top:12px;">
      <label>Observação para entrega (opcional)</label>
      <input type="text" id="deliveryNoteInput" placeholder="Ponto de referência, melhor horário, etc." value="${escapeAttr(deliveryNote)}">
    </div>`;

  document.getElementById('useGpsBtn').onclick = handleUseGps;
  document.getElementById('useCepBtn').onclick = ()=>{ deliveryCepInput = document.getElementById('cepInput').value; handleUseCep(); };
  document.getElementById('cepInput').addEventListener('input', e=>{ deliveryCepInput = e.target.value; });
  document.getElementById('cepInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){ deliveryCepInput=e.target.value; handleUseCep(); } });
  document.getElementById('deliveryNoteInput').addEventListener('input', e=>{ deliveryNote = e.target.value; });
}

function buildWhatsAppMessage(fee, total){
  const lines = [];
  lines.push('Olá! Gostaria de fazer o seguinte pedido:');
  cart.forEach(item=>{
    lines.push(`• ${item.qty}x ${item.name} — ${formatPrice(item.price*item.qty)}`);
  });
  lines.push('');
  lines.push(`Subtotal: ${formatPrice(cartTotal())}`);
  if(fulfillmentType==='retirada'){
    lines.push(`Entrega: Retirada no local (${STORE.address})`);
  } else if(fulfillmentType==='entrega'){
    const metodo = deliveryMethod==='gps' ? 'localização do aparelho' : (deliveryMethod==='cep' ? `CEP ${deliveryCepInput}` : 'não informado');
    lines.push(`Entrega — taxa estimada via ${metodo}${deliveryDistanceKm!=null?` (~${deliveryDistanceKm.toFixed(1)}km)`:''}`);
    lines.push(`Taxa de entrega: ${fee!=null?formatPrice(fee):'a confirmar'}`);
    if(deliveryNote) lines.push(`Observação: ${deliveryNote}`);
    lines.push(`Total: ${formatPrice(total)}`);
    
  } else {
    lines.push('Tipo: a combinar');
  }
  return lines.join('\n');
}
function closeModalRoot(){
  const root = document.getElementById('modalRoot');

  if(root){
    root.innerHTML = '';
  }
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.remove('show'), 2600);
}

init();

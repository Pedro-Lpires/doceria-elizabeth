/* ============================================================
   admin.js — Painel administrativo (Elizabeth's Doceria)
   Lê e grava direto no Firestore (projeto doceria-nick), via
   SDK compat (funciona com <script> normal, sem servidor):
     - coleção doceria_produtos → um documento por produto
     - doc doceria_config/admin → { password }
   ============================================================ */

const DEFAULT_PASS = "eliza2026";
const productsCol = db.collection('doceria_produtos');
const configDoc = db.collection('doceria_config').doc('admin');
const categoriesCol = db.collection('doceria_categorias');

let products = [];
let categoriesMeta = []; // [{name, order, featured}] ordenado
let categoriesLoadedOnce = false;
let productsLoadedOnce = false;
let isAuthed = false;
let editingId = null;
let pendingImages = [];
const MAX_IMAGES = 4;
let currentPassword = null;

function formatPrice(v){
  return Number(v).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});
}
function escapeHtml(s){ return String(s??'').replace(/[&<>"']/g, m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function escapeAttr(s){ return escapeHtml(s); }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(()=>t.classList.remove('show'), 2600);
}

/* ---------------- SENHA ---------------- */
async function loadPassword(){
  try{
    const snap = await configDoc.get();
    currentPassword = snap.exists ? (snap.data().password || DEFAULT_PASS) : DEFAULT_PASS;
  }catch(e){
    console.error('Erro ao carregar senha, usando padrão', e);
    currentPassword = DEFAULT_PASS;
  }
}

async function savePassword(newPass){
  try{
    await configDoc.set({password:newPass}, {merge:true});
    currentPassword = newPass;
    return true;
  }catch(e){
    console.error('Erro ao salvar nova senha', e);
    return false;
  }
}

/* ---------------- PRODUTOS ---------------- */
function startListening(){
  productsCol.onSnapshot((snap)=>{
    products = snap.docs.map(d=>({id:d.id, ...d.data()}));
    productsLoadedOnce = true;
    maybeBackfillCategories();
    if(isAuthed){
      renderAdminList();
      const h3 = document.querySelector('.admin-list h3');
      if(h3) h3.textContent = `Produtos cadastrados (${products.length})`;
    }
  }, (err)=>{
    console.error('Erro ao sincronizar produtos', err);
    toast('Erro de conexão com o banco de dados.');
  });
}

/* ---------------- TIPOS / SEÇÕES ---------------- */
function startListeningCategories(){
  categoriesCol.onSnapshot((snap)=>{
    categoriesMeta = snap.docs
      .map(d=>({name:d.id, order: d.data().order ?? 0, featured: !!d.data().featured}))
      .sort((a,b)=>a.order-b.order);
    categoriesLoadedOnce = true;
    maybeBackfillCategories();
    if(isAuthed){
      renderCategoryList();
      refreshCategorySelect();
    }
  }, (err)=>{
    console.error('Erro ao sincronizar tipos', err);
  });
}

// Se ainda não existe nenhum tipo cadastrado mas já existem produtos com
// categorias antigas (texto livre), cria os tipos automaticamente uma vez,
// na ordem em que aparecem, pra não perder nada do que já foi cadastrado.
let backfillRan = false;
async function maybeBackfillCategories(){
  if(backfillRan) return;
  if(!categoriesLoadedOnce || !productsLoadedOnce) return;
  if(categoriesMeta.length > 0) return;
  if(products.length === 0) return;
  backfillRan = true;
  const names = [...new Set(products.map(p=>p.category).filter(Boolean))];
  try{
    await Promise.all(names.map((name, i)=>categoriesCol.doc(name).set({order:i, featured:false})));
  }catch(e){
    console.error('Erro ao migrar tipos existentes', e);
    backfillRan = false;
  }
}

function refreshCategorySelect(){
  const sel = document.getElementById('fCategory');
  if(!sel) return;
  const current = sel.value;
  if(categoriesMeta.length === 0){
    sel.innerHTML = `<option value="">Crie um tipo primeiro ↑</option>`;
    return;
  }
  sel.innerHTML = categoriesMeta.map(c=>`<option value="${escapeAttr(c.name)}">${escapeHtml(c.name)}${c.featured?' ⭐':''}</option>`).join('');
  if(categoriesMeta.some(c=>c.name===current)) sel.value = current;
}

async function handleAddCategory(){
  const input = document.getElementById('newCatName');
  const name = input.value.trim();
  if(!name){ toast('Digite um nome para o tipo.'); return; }
  if(categoriesMeta.some(c=>c.name.toLowerCase()===name.toLowerCase())){
    toast('Já existe um tipo com esse nome.');
    return;
  }
  const nextOrder = categoriesMeta.length ? Math.max(...categoriesMeta.map(c=>c.order))+1 : 0;
  try{
    await categoriesCol.doc(name).set({order: nextOrder, featured:false});
    input.value = '';
    toast('Tipo criado!');
  }catch(e){
    console.error('Erro ao criar tipo', e);
    toast('Não foi possível criar o tipo. Tente de novo.');
  }
}

async function handleMoveCategory(name, direction){
  const idx = categoriesMeta.findIndex(c=>c.name===name);
  const swapIdx = idx + direction;
  if(idx<0 || swapIdx<0 || swapIdx>=categoriesMeta.length) return;
  const a = categoriesMeta[idx], b = categoriesMeta[swapIdx];
  try{
    await Promise.all([
      categoriesCol.doc(a.name).update({order:b.order}),
      categoriesCol.doc(b.name).update({order:a.order})
    ]);
  }catch(e){
    console.error('Erro ao reordenar tipos', e);
    toast('Não foi possível reordenar agora.');
  }
}

async function handleToggleFeatured(name){
  const c = categoriesMeta.find(c=>c.name===name);
  if(!c) return;
  try{
    await categoriesCol.doc(name).update({featured: !c.featured});
  }catch(e){
    console.error('Erro ao destacar tipo', e);
  }
}

async function handleDeleteCategory(name){
  const inUse = products.filter(p=>p.category===name).length;
  const msg = inUse > 0
    ? `${inUse} produto(s) ainda usam "${name}". Eles continuam existindo, mas esse tipo some da lista pra novos cadastros. Excluir mesmo assim?`
    : `Excluir o tipo "${name}"?`;
  if(!confirm(msg)) return;
  try{
    await categoriesCol.doc(name).delete();
    toast('Tipo excluído.');
  }catch(e){
    console.error('Erro ao excluir tipo', e);
    toast('Não foi possível excluir agora.');
  }
}

function renderCategoryList(){
  const wrap = document.getElementById('catItems');
  if(!wrap) return;
  if(categoriesMeta.length===0){
    wrap.innerHTML = `<div style="font-size:13px;color:var(--text-soft);">Nenhum tipo criado ainda.</div>`;
    return;
  }
  wrap.innerHTML = categoriesMeta.map((c,i)=>`
    <div class="admin-row">
      <div class="ph" style="font-size:18px;">${c.featured?'⭐':'🏷️'}</div>
      <div class="info">
        <b>${escapeHtml(c.name)}</b>
        <span>${products.filter(p=>p.category===c.name).length} produto(s)${c.featured?' · destacado':''}</span>
      </div>
      <div class="acts">
        <button class="icon-btn" data-move-up="${escapeAttr(c.name)}" title="Subir" ${i===0?'disabled style="opacity:.3;"':''}>↑</button>
        <button class="icon-btn" data-move-down="${escapeAttr(c.name)}" title="Descer" ${i===categoriesMeta.length-1?'disabled style="opacity:.3;"':''}>↓</button>
        <button class="icon-btn" data-feature="${escapeAttr(c.name)}" title="${c.featured?'Remover destaque':'Marcar como destaque'}">${c.featured?'★':'☆'}</button>
        <button class="icon-btn del" data-del-cat="${escapeAttr(c.name)}" title="Excluir tipo">🗑</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('[data-move-up]').forEach(btn=>btn.onclick = ()=>handleMoveCategory(btn.dataset.moveUp, -1));
  wrap.querySelectorAll('[data-move-down]').forEach(btn=>btn.onclick = ()=>handleMoveCategory(btn.dataset.moveDown, 1));
  wrap.querySelectorAll('[data-feature]').forEach(btn=>btn.onclick = ()=>handleToggleFeatured(btn.dataset.feature));
  wrap.querySelectorAll('[data-del-cat]').forEach(btn=>btn.onclick = ()=>handleDeleteCategory(btn.dataset.delCat));
}

async function saveProductWrite(promiseFn, showToast=true){
  try{
    await promiseFn();
    if(showToast) toast('Salvo com sucesso!');
    return true;
  }catch(e){
    console.error('Erro ao salvar no Firestore', e);
    if(showToast) toast('Não foi possível salvar. Verifique sua internet e tente de novo.');
    return false;
  }
}

/* ---------------- LOGIN ---------------- */
function renderLogin(errorMsg){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="modal" style="margin:0 auto;">
      <h2>Área da loja</h2>
      <div class="sub">Entre com a senha para cadastrar ou editar produtos.</div>
      <div class="field">
        <label>Senha</label>
        <input type="password" id="passInput" placeholder="••••••••">
      </div>
      ${errorMsg ? `<div style="color:#b3261e;font-size:12.5px;margin-bottom:8px;">${errorMsg}</div>` : ''}
      <div class="modal-actions">
        <button class="btn-primary" id="doLogin">Entrar</button>
      </div>
      <div style="text-align:center;margin-top:16px;"><a href="index.html" style="font-size:12px;color:var(--text-soft);">← Voltar para o site</a></div>
    </div>`;
  const input = document.getElementById('passInput');
  input.focus();
  const tryLogin = ()=>{
    if(input.value === currentPassword){
      isAuthed = true;
      renderPanel();
    } else {
      renderLogin('Senha incorreta.');
    }
  };
  document.getElementById('doLogin').onclick = tryLogin;
  input.addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });
}

/* ---------------- PAINEL ---------------- */
function renderPanel(){
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="admin-topbar">
      <h1>Painel — Elizabeth's Doceria</h1>
      <div style="display:flex;gap:14px;align-items:center;">
        <a href="index.html" target="_blank">Ver site ↗</a>
        <a href="#" id="logoutBtn">Sair</a>
      </div>
    </div>

    <div class="modal wide" style="margin:0 auto;">
      <div class="pw-toggle"><a href="#" id="pwToggle">Trocar senha do painel</a></div>

      <div class="pw-box" id="pwBox" style="display:none;">
        <h3>Trocar senha</h3>
        <div class="field"><label>Senha atual</label><input type="password" id="pwOld"></div>
        <div class="field"><label>Nova senha</label><input type="password" id="pwNew"></div>
        <div class="field"><label>Confirmar nova senha</label><input type="password" id="pwConfirm"></div>
        <div id="pwErr" style="color:#b3261e;font-size:12.5px;margin-bottom:8px;display:none;"></div>
        <div class="modal-actions">
          <button class="btn-secondary" id="pwCancel">Cancelar</button>
          <button class="btn-primary" id="pwSave">Salvar nova senha</button>
        </div>
      </div>

      <h2 id="formTitle">Novo produto</h2>
      <div class="sub">Preencha os dados, adicione uma foto e clique em salvar. Aparece na hora no cardápio.</div>

      <div class="field">
        <label>Fotos do produto (até ${MAX_IMAGES} — frente, corte, outros ângulos...)</label>
        <div id="imgThumbs" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"></div>
        <div class="img-drop" id="imgDrop">
          <span class="hint" id="imgDropHint">Toque para adicionar uma foto</span>
          <input type="file" id="imgInput" accept="image/*" multiple style="display:none;">
        </div>
      </div>

      <div class="field">
        <label>Nome do produto</label>
        <input type="text" id="fName" placeholder="Ex: Brownie de Nutella">
      </div>

      <div class="field">
        <label>Descrição</label>
        <textarea id="fDesc" placeholder="Conte o que torna esse doce especial"></textarea>
      </div>

      <div class="row2">
        <div class="field">
          <label>Valor (R$)</label>
          <input type="number" id="fPrice" min="0" step="0.01" placeholder="0,00">
        </div>
        <div class="field">
          <label>Tipo / seção</label>
          <select id="fCategory"></select>
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-secondary" id="cancelForm">Cancelar</button>
        <button class="btn-primary" id="saveForm">Salvar produto</button>
      </div>

      <div class="admin-list">
        <h3>Produtos cadastrados (${products.length})</h3>
        <div id="adminItems"></div>
      </div>
    </div>

    <div class="modal wide" style="margin:20px auto 0;">
      <h2 style="font-size:20px;">Tipos / Seções</h2>
      <div class="sub">Crie os tipos antes de cadastrar produtos neles. Use as setas pra organizar a ordem das fileiras no site, e a estrela pra destacar um tipo (borda roxa nos cards + aparece com ⭐).</div>
      <div style="display:flex;gap:8px;margin-bottom:16px;">
        <input type="text" id="newCatName" placeholder="Ex: Ovos de Páscoa" style="flex:1;padding:10px 12px;border:1px solid #e2d1eb;border-radius:10px;font-family:'Jost',sans-serif;font-size:14px;">
        <button class="btn-primary" style="flex:0 0 auto;padding:10px 18px;" id="addCatBtn">Criar tipo</button>
      </div>
      <div id="catItems"></div>
    </div>`;

  document.getElementById('logoutBtn').onclick = (e)=>{ e.preventDefault(); isAuthed=false; renderLogin(); };
  document.getElementById('cancelForm').onclick = resetForm;
  document.getElementById('imgDrop').onclick = ()=>document.getElementById('imgInput').click();
  document.getElementById('imgInput').addEventListener('change', handleImageSelect);
  document.getElementById('saveForm').onclick = handleSaveForm;
  document.getElementById('addCatBtn').onclick = handleAddCategory;
  document.getElementById('newCatName').addEventListener('keydown', e=>{ if(e.key==='Enter') handleAddCategory(); });

  document.getElementById('pwToggle').onclick = (e)=>{
    e.preventDefault();
    const box = document.getElementById('pwBox');
    box.style.display = box.style.display==='none' ? 'block' : 'none';
  };
  document.getElementById('pwCancel').onclick = ()=>{ document.getElementById('pwBox').style.display='none'; };
  document.getElementById('pwSave').onclick = handleChangePassword;

  refreshCategorySelect();
  renderCategoryList();
  renderAdminList();
  renderImageThumbs();
}

async function handleChangePassword(){
  const oldPass = document.getElementById('pwOld').value;
  const newPass = document.getElementById('pwNew').value;
  const confirmPass = document.getElementById('pwConfirm').value;
  const errBox = document.getElementById('pwErr');
  errBox.style.display = 'none';

  if(oldPass !== currentPassword){
    errBox.textContent = 'Senha atual incorreta.';
    errBox.style.display = 'block';
    return;
  }
  if(newPass.length < 4){
    errBox.textContent = 'A nova senha precisa ter pelo menos 4 caracteres.';
    errBox.style.display = 'block';
    return;
  }
  if(newPass !== confirmPass){
    errBox.textContent = 'As senhas novas não são iguais.';
    errBox.style.display = 'block';
    return;
  }

  const btn = document.getElementById('pwSave');
  btn.disabled = true; btn.textContent = 'Salvando...';
  const ok = await savePassword(newPass);
  btn.disabled = false; btn.textContent = 'Salvar nova senha';

  if(ok){
    toast('Senha alterada com sucesso!');
    document.getElementById('pwOld').value='';
    document.getElementById('pwNew').value='';
    document.getElementById('pwConfirm').value='';
    document.getElementById('pwBox').style.display='none';
  } else {
    errBox.textContent = 'Não foi possível salvar a nova senha. Tente de novo.';
    errBox.style.display = 'block';
  }
}

function resetForm(){
  editingId = null; pendingImages = [];
  document.getElementById('formTitle').textContent = 'Novo produto';
  document.getElementById('fName').value='';
  document.getElementById('fDesc').value='';
  document.getElementById('fPrice').value='';
  renderImageThumbs();
}

function renderImageThumbs(){
  const wrap = document.getElementById('imgThumbs');
  const hint = document.getElementById('imgDropHint');
  if(!wrap) return;
  wrap.innerHTML = pendingImages.map((src, i)=>`
    <div style="position:relative;width:64px;height:64px;">
      <img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;border:1px solid #e2d1eb;">
      <button data-remove-img="${i}" style="position:absolute;top:-6px;right:-6px;width:20px;height:20px;border-radius:50%;background:#b3261e;color:#fff;font-size:11px;line-height:1;display:flex;align-items:center;justify-content:center;">✕</button>
    </div>`).join('');
  wrap.querySelectorAll('[data-remove-img]').forEach(btn=>{
    btn.onclick = (e)=>{
      e.stopPropagation();
      pendingImages.splice(parseInt(btn.dataset.removeImg), 1);
      renderImageThumbs();
    };
  });
  if(hint){
    hint.textContent = pendingImages.length >= MAX_IMAGES
      ? `Máximo de ${MAX_IMAGES} fotos atingido`
      : (pendingImages.length===0 ? 'Toque para adicionar uma foto' : 'Adicionar outro ângulo');
    document.getElementById('imgDrop').style.opacity = pendingImages.length >= MAX_IMAGES ? '0.5' : '1';
    document.getElementById('imgDrop').style.pointerEvents = pendingImages.length >= MAX_IMAGES ? 'none' : 'auto';
  }
}

function compressImageFile(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (ev)=>{
      const img = new Image();
      img.onload = ()=>{
        const maxW = 750;
        const scale = Math.min(1, maxW/img.width);
        const canvas = document.createElement('canvas');
        canvas.width = img.width*scale;
        canvas.height = img.height*scale;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        let quality = 0.72;
        let dataUrl = canvas.toDataURL('image/jpeg', quality);
        const maxChars = 260000; // ~190KB por foto, com folga pra caber até 4 no limite de 1MB do documento
        while(dataUrl.length > maxChars && quality > 0.3){
          quality -= 0.08;
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleImageSelect(e){
  const files = Array.from(e.target.files || []);
  e.target.value = ''; // permite selecionar o mesmo arquivo de novo depois
  if(!files.length) return;
  const room = MAX_IMAGES - pendingImages.length;
  if(room <= 0){ toast(`Máximo de ${MAX_IMAGES} fotos por produto.`); return; }
  const toProcess = files.slice(0, room);
  if(files.length > room) toast(`Só cabiam mais ${room} foto(s) — o restante foi ignorado.`);
  for(const file of toProcess){
    try{
      const dataUrl = await compressImageFile(file);
      pendingImages.push(dataUrl);
      renderImageThumbs();
    }catch(err){
      console.error('Erro ao processar imagem', err);
      toast('Não foi possível processar uma das fotos.');
    }
  }
}

function getProductImages(p){
  return (p && p.images && p.images.length) ? p.images : (p && p.image ? [p.image] : []);
}

async function handleSaveForm(){
  const name = document.getElementById('fName').value.trim();
  const description = document.getElementById('fDesc').value.trim();
  const price = parseFloat(document.getElementById('fPrice').value);
  const category = document.getElementById('fCategory').value.trim();

  if(!name || !category || isNaN(price)){
    toast('Preencha nome, valor e tipo.');
    return;
  }

  const btn = document.getElementById('saveForm');
  btn.disabled = true; btn.textContent = 'Salvando...';

  let ok;
  if(editingId){
    const existing = products.find(p=>p.id===editingId);
    const data = {
      name, description, price, category,
      images: pendingImages,
      image: firebase.firestore.FieldValue.delete(),
      hidden: existing ? !!existing.hidden : false
    };
    ok = await saveProductWrite(()=>productsCol.doc(editingId).update(data), true);
  } else {
    ok = await saveProductWrite(()=>productsCol.add({
      name, description, price, category, images: pendingImages, hidden:false
    }), true);
  }

  btn.disabled = false; btn.textContent = 'Salvar produto';
  if(ok) resetForm();
}

function renderAdminList(){
  const wrap = document.getElementById('adminItems');
  if(!wrap) return;
  if(products.length===0){ wrap.innerHTML = `<div style="font-size:13px;color:var(--text-soft);">Nenhum produto ainda.</div>`; return; }
  wrap.innerHTML = products.map(p=>{
    const imgs = getProductImages(p);
    return `
    <div class="admin-row" style="${p.hidden?'opacity:0.5;':''}">
      ${imgs[0] ? `<img src="${imgs[0]}">` : `<div class="ph">🍰</div>`}
      <div class="info">
        <b>${escapeHtml(p.name)}${p.hidden?' <span style="font-weight:400;color:var(--text-soft);">(oculto)</span>':''}</b>
        <span>${escapeHtml(p.category)} · ${formatPrice(p.price)}${imgs.length>1?` · ${imgs.length} fotos`:''}</span>
      </div>
      <div class="acts">
        <button class="icon-btn" data-toggle="${p.id}" title="${p.hidden?'Mostrar':'Ocultar'}">${p.hidden?'👁':'🙈'}</button>
        <button class="icon-btn" data-edit="${p.id}" title="Editar">✎</button>
        <button class="icon-btn del" data-del="${p.id}" title="Excluir">🗑</button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('[data-toggle]').forEach(btn=>{
    btn.onclick = ()=>toggleHidden(btn.dataset.toggle);
  });
  wrap.querySelectorAll('[data-edit]').forEach(btn=>{
    btn.onclick = ()=>startEdit(btn.dataset.edit);
  });
  wrap.querySelectorAll('[data-del]').forEach(btn=>{
    btn.onclick = ()=>handleDelete(btn.dataset.del);
  });
}

async function toggleHidden(id){
  const p = products.find(p=>p.id===id);
  if(!p) return;
  await saveProductWrite(()=>productsCol.doc(id).update({hidden: !p.hidden}), true);
}

function startEdit(id){
  const p = products.find(p=>p.id===id);
  if(!p) return;
  editingId = id; pendingImages = [...getProductImages(p)];
  document.getElementById('formTitle').textContent = 'Editar produto';
  document.getElementById('fName').value = p.name;
  document.getElementById('fDesc').value = p.description||'';
  document.getElementById('fPrice').value = p.price;
  document.getElementById('fCategory').value = p.category;
  renderImageThumbs();
  document.querySelector('.modal.wide').scrollIntoView({behavior:'smooth'});
}

async function handleDelete(id){
  if(!confirm('Excluir este produto do cardápio?')) return;
  const ok = await saveProductWrite(()=>productsCol.doc(id).delete(), true);
  if(ok && editingId===id) resetForm();
}

/* ---------------- INIT ---------------- */
async function init(){
  document.getElementById('root').innerHTML = `<div class="loading">Carregando...</div>`;
  await loadPassword();
  startListening();
  startListeningCategories();
  renderLogin();
}
init();

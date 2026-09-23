const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clean = (s) => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');

async function rpcFirst(client, name, args) {
  if (!client?.rpc) return null;
  try {
    const {data, error} = await client.rpc(name, args);
    if (error || data == null) return null;
    return data;
  } catch { return null; }
}

async function post(path, body) {
  const res = await fetch(path, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(data.error || 'Request failed');
  return data;
}

export async function issueLoginCode(client, session) {
  if (!session?.id || !session?.token) throw Error('Join the world first.');
  const rpc = await rpcFirst(client, 'carbon_login_code_issue', {p_id: session.id, p_token: session.token});
  if (rpc?.code) return {code: String(rpc.code).toUpperCase(), expires_in: Number(rpc.expires_in) || 720};
  return post('/api/link-code', {id: session.id, token: session.token, name:session.name});
}

export async function redeemLoginCode(client, code) {
  const v = clean(code);
  if (v.length !== 6) throw Error('Enter the 6-character code.');
  const rpc = await rpcFirst(client, 'carbon_login_code_redeem', {p_code: v});
  if (rpc?.token) return rpc;
  return post('/api/link-redeem', {code: v});
}

export function storeSessionToken(token) {
  try { sessionStorage.setItem('carbon-session-v8', token); } catch {}
}

export function installLoginCode({game, toast}) {
  const $ = (id) => document.getElementById(id);
  const show = $('loginCodeShow');
  const make = $('makeLoginCode');
  const redeem = $('redeemCode');
  if (make) make.onclick = async () => {
    make.disabled = true;
    try {
      game.upgrade.a.save();
      await game.accountSaves?.flush();
      await game.graphics?.flush();
      const r = await issueLoginCode(game.net?.client, game.net?.session);
      if (show) {
        show.hidden = false;
        show.textContent = 'Code ' + r.code + ' for ' + game.net.session.name + ' · expires in ' + Math.round((r.expires_in || 720) / 60) + ' min. Type it on the other device.';
      }
      toast?.('Login code: ' + r.code);
    } catch (e) { toast?.(e.message || 'Could not make a code.'); }
    finally { make.disabled = false; }
  };
  if ($('loginCode')) $('loginCode').addEventListener('input',()=>{$('name').required=!clean($('loginCode').value);});
  if (redeem) redeem.onclick = () => {
    if (!clean($('loginCode')?.value)) {
      if ($('joinError')) $('joinError').textContent = 'Enter the 6-character code.';
      return;
    }
    $('joinForm')?.requestSubmit();
  };
  const form = $('joinForm');let redeemBusy=false;
  if (form) form.addEventListener('submit', async (e) => {
    const code = clean($('loginCode')?.value);
    if (!code) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(redeemBusy||game.joining)return;redeemBusy=true;redeem.disabled=true;
    $('join').disabled = true;
    $('joinError').textContent = '';
    try {
      const r = await redeemLoginCode(game.net?.client, code);
      if (!r?.token||!r?.id) throw Error('That code did not work.');
      game.net.expectedAccountId=r.id;
      if(r.name)$('name').value=r.name;
      if(!$('name').value)$('name').value='Survivor';
      storeSessionToken(r.token);
      $('loginCode').value = '';
      form.requestSubmit();
    } catch (err) {
      $('joinError').textContent = err.message || 'Could not use that code.';
      $('join').disabled = false;
    } finally {redeemBusy=false;redeem.disabled=false;}
  }, true);
  return {issueLoginCode, redeemLoginCode, clean, ALPHA};
}

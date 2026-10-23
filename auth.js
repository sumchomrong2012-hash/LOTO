// Shared session helpers. `supabase` is the client created in js/supabase-client.js
let currentProfile = null;

async function requireLogin() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) { location.href = 'index.html'; return null; }
  return data.session;
}

async function loadProfile() {
  const session = await requireLogin();
  if (!session) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
  if (error) { alert('Could not load your account: ' + error.message); return null; }
  currentProfile = data;
  renderProfile();
  return data;
}

function renderProfile() {
  if (!currentProfile) return;
  document.getElementById('userEmail').textContent = currentProfile.email;
  document.getElementById('balance').textContent = '$' + Number(currentProfile.balance).toFixed(2);
  document.getElementById('adminLink').style.display = currentProfile.role === 'admin' ? '' : 'none';
}

async function logout() {
  await supabase.auth.signOut();
  location.href = 'index.html';
}

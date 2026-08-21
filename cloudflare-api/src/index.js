const json = (data, status = 200, headers = {}) => new Response(JSON.stringify({ data }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
});
const error = (message, status = 400, headers = {}) => new Response(JSON.stringify({ error: { message } }), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
});
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const shortCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();

function cors(request, env) {
  const origin = request.headers.get('origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
  return origin && allowed.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
}

function publicURL(env, key) {
  return `${String(env.PUBLIC_BASE_URL).replace(/\/$/, '')}/files/${key}`;
}

async function body(request) {
  try { return await request.json(); } catch { throw new Error('Invalid JSON body.'); }
}

function fromDataURL(value) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(value || '');
  if (!match) throw new Error('Image must be a base64 data URL.');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { mimeType: match[1], bytes };
}

async function saveImage(env, sessionID, kind, dataURL, position = 0) {
  const { mimeType, bytes } = fromDataURL(dataURL);
  if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Image is too large.');
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'jpg';
  const key = `sessions/${sessionID}/${kind}-${id()}.${extension}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: mimeType } });
  await env.DB.prepare('INSERT INTO session_images (id, session_id, kind, storage_key, mime_type, size_bytes, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id(), sessionID, kind, key, mimeType, bytes.byteLength, position, now()).run();
  return { key, url: publicURL(env, key), mimeType, size: bytes.byteLength };
}

async function sessionResponse(env, row) {
  if (!row) return null;
  const images = await env.DB.prepare('SELECT storage_key FROM session_images WHERE session_id = ? AND kind = ? ORDER BY position').bind(row.id, 'image').all();
  const stored = key => key ? { key, url: publicURL(env, key) } : null;
  return {
    id: row.id, shortCode: row.short_code, email: row.email, phone: row.phone, layoutId: row.layout_id,
    paperSize: row.paper_size, frameId: row.frame_id, status: row.status, images: images.results.map(item => publicURL(env, item.storage_key)),
    finalImage: stored(row.final_image_key), printImage: stored(row.print_image_key), animatedImage: stored(row.animated_image_key),
    downloadUrl: row.download_url, createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at,
  };
}

async function handleAPI(request, env, url, headers) {
  const { pathname } = url;
  if (pathname === '/health') return json({ ok: true, service: 'urbanmenphoto-cloudflare-api' }, 200, headers);
  if (pathname === '/api/dslr/cameras' || pathname === '/api/dslr/capture') return error('DSLR harus diakses melalui agent lokal komputer booth, bukan Cloudflare Worker.', 501, headers);
  if (pathname === '/api/frames' && request.method === 'GET') {
    const frames = await env.DB.prepare('SELECT * FROM frames WHERE active = 1 ORDER BY created_at DESC').all();
    return json(frames.results.map(frame => ({ ...frame, layoutCount: frame.layout_count, imageUrl: frame.image_url, slotJson: frame.slot_json, templateType: frame.template_type, paperSize: frame.paper_size, printMode: frame.print_mode, printCopies: frame.print_copies, active: Boolean(frame.active) })), 200, headers);
  }
  if (pathname === '/api/sessions' && request.method === 'POST') {
    const input = await body(request); const createdAt = now(); const sessionID = input.id || id(); const code = shortCode();
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString(); const downloadURL = `${String(env.PUBLIC_FRONTEND_URL || '').replace(/\/$/, '')}/gallery/${sessionID}`;
    await env.DB.prepare('INSERT INTO sessions (id, short_code, email, phone, layout_id, paper_size, frame_id, status, download_url, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(sessionID, code, input.email || null, input.phone || null, input.layoutId || null, input.paperSize || null, input.frameId || null, input.status || 'created', downloadURL, createdAt, createdAt, expiresAt).run();
    return json(await sessionResponse(env, await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionID).first()), 201, headers);
  }
  const sessionMatch = /^\/api\/sessions\/([^/]+)(?:\/(finalize))?$/.exec(pathname);
  if (sessionMatch) {
    const [, sessionID, action] = sessionMatch; const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionID).first();
    if (!row) return error('Session not found.', 404, headers);
    if (!action && request.method === 'GET') return json(await sessionResponse(env, row), 200, headers);
    const input = await body(request);
    if (action === 'finalize' && request.method === 'POST') {
      const images = input.images || []; const saved = [];
      for (let index = 0; index < images.length; index += 1) saved.push(await saveImage(env, sessionID, 'image', images[index], index));
      const finalImage = input.finalImage ? await saveImage(env, sessionID, 'final', input.finalImage) : null;
      const printImage = input.printImage ? await saveImage(env, sessionID, 'print', input.printImage) : null;
      const animatedImage = input.animatedImage ? await saveImage(env, sessionID, 'animated', input.animatedImage) : null;
      await env.DB.prepare('UPDATE sessions SET email=?, phone=?, layout_id=?, paper_size=?, frame_id=?, status=?, final_image_key=?, print_image_key=?, animated_image_key=?, updated_at=? WHERE id=?')
        .bind(input.email || row.email, input.phone || row.phone, input.layoutId || row.layout_id, input.paperSize || row.paper_size, input.frameId || row.frame_id, 'finalized', finalImage?.key || row.final_image_key, printImage?.key || row.print_image_key, animatedImage?.key || row.animated_image_key, now(), sessionID).run();
      return json(await sessionResponse(env, await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionID).first()), 200, headers);
    }
    if (!action && request.method === 'PATCH') {
      await env.DB.prepare('UPDATE sessions SET email=?, phone=?, layout_id=?, paper_size=?, frame_id=?, status=?, updated_at=? WHERE id=?')
        .bind(input.email ?? row.email, input.phone ?? row.phone, input.layoutId ?? row.layout_id, input.paperSize ?? row.paper_size, input.frameId ?? row.frame_id, input.status ?? row.status, now(), sessionID).run();
      return json(await sessionResponse(env, await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionID).first()), 200, headers);
    }
  }
  const galleryMatch = /^\/api\/galleries\/([^/]+)$/.exec(pathname);
  if (galleryMatch && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM sessions WHERE id = ?').bind(galleryMatch[1]).first();
    if (!row) return error('Gallery not found.', 404, headers);
    const session = await sessionResponse(env, row); return json({ sessionId: session.id, status: session.status, finalImage: session.finalImage, animatedImage: session.animatedImage, images: session.images, downloadUrl: session.downloadUrl, expiresAt: session.expiresAt, expired: Date.parse(session.expiresAt) <= Date.now() }, 200, headers);
  }
  if (pathname === '/api/events/errors' && request.method === 'POST') {
    const input = await body(request); await env.DB.prepare('INSERT INTO error_events (id, category, session_id, message, source, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id(), input.category || 'system', input.sessionId || null, input.message || '', input.source || 'client', JSON.stringify(input.metadata || {}), now()).run();
    return json({ ok: true }, 201, headers);
  }
  return error('Route not found.', 404, headers);
}

export default {
  async fetch(request, env) {
    const headers = cors(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'content-type,authorization,x-session-token' } });
    const url = new URL(request.url);
    if (url.pathname.startsWith('/files/') && request.method === 'GET') {
      const object = await env.MEDIA.get(url.pathname.slice(7));
      return object ? new Response(object.body, { headers: { ...headers, 'content-type': object.httpMetadata?.contentType || 'application/octet-stream' } }) : error('File not found.', 404, headers);
    }
    return handleAPI(request, env, url, headers);
  },
};

import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'access-control-allow-origin': Deno.env.get('ALLOWED_ORIGIN') || '*', 'access-control-allow-headers': 'authorization, content-type, x-session-token' }
const reply = (data: unknown, status = 200) => Response.json({ data }, { status, headers: cors })
const fail = (message: string, status = 400) => Response.json({ error: { message } }, { status, headers: cors })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...cors, 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS' } })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(request.url); const path = url.pathname.replace(/^\/api/, '')
  if (path === '/health') return reply({ ok: true, service: 'urbanmenphoto-supabase-api' })
  if (path === '/frames' && request.method === 'GET') {
    const { data, error } = await supabase.from('frames').select('*').eq('active', true).order('created_at', { ascending: false })
    return error ? fail(error.message, 500) : reply(data)
  }
  if (path === '/sessions' && request.method === 'POST') {
    const input = await request.json(); const id = input.id || crypto.randomUUID(); const createdAt = new Date().toISOString()
    const record = { id, short_code: Math.random().toString(36).slice(2, 8).toUpperCase(), email: input.email || null, phone: input.phone || null, layout_id: input.layoutId || null, paper_size: input.paperSize || null, frame_id: input.frameId || null, status: input.status || 'created', download_url: `${Deno.env.get('PUBLIC_FRONTEND_URL')}/gallery/${id}`, created_at: createdAt, updated_at: createdAt, expires_at: new Date(Date.now() + 604800000).toISOString() }
    const { data, error } = await supabase.from('sessions').insert(record).select().single()
    return error ? fail(error.message, 500) : reply(data, 201)
  }
  return fail('Route not found.', 404)
})

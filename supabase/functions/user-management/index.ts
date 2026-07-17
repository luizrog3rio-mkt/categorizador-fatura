// Edge Function: user-management
// Operações de admin sobre usuários (listar, criar, mudar papel, banir, deletar).
// Requer: caller autenticado com role='admin' na tabela profiles.
// verify_jwt=false (validamos o token manualmente para poder usar o service key).
import { createClient } from 'jsr:@supabase/supabase-js@2.110.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors })

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

  // Verificar JWT e checar que o caller é admin
  const { data: { user }, error: authErr } = await adminClient.auth.getUser(authHeader.slice(7))
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const { data: callerProfile } = await adminClient
    .from('profiles').select('role').eq('id', user.id).single()
  if (callerProfile?.role !== 'admin') return json({ error: 'Forbidden' }, 403)

  const body = await req.json()

  switch (body.action) {
    case 'list': {
      const { data: authData, error } = await adminClient.auth.admin.listUsers()
      if (error) return json({ error: error.message }, 500)
      const { data: profiles } = await adminClient.from('profiles').select('id, role')
      const roleMap = new Map((profiles ?? []).map((p: any) => [p.id, p.role]))
      const result = (authData.users ?? []).map((u: any) => ({
        id: u.id,
        email: u.email,
        role: roleMap.get(u.id) ?? 'viewer',
        banned: !!(u.banned_until && new Date(u.banned_until) > new Date()),
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }))
      return json(result)
    }

    case 'create': {
      const { email, password, role } = body
      if (!email || !password) return json({ error: 'email e password obrigatórios' }, 400)
      const { data: { user: novo }, error } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })
      if (error) return json({ error: error.message }, 400)
      if (!novo) return json({ error: 'Falha ao criar usuário' }, 500)
      // o trigger cria o profile com role='viewer' (default fail-safe); seta o papel
      // escolhido EXPLICITAMENTE — admin só quando pedido, nunca por omissão.
      const novoRole = role === 'admin' ? 'admin' : 'viewer'
      await adminClient.from('profiles').update({ role: novoRole }).eq('id', novo.id)
      return json({ id: novo.id, email: novo.email, role: novoRole })
    }

    case 'update_role': {
      const { user_id, role } = body
      if (!user_id || !role) return json({ error: 'user_id e role obrigatórios' }, 400)
      if (!['admin', 'viewer'].includes(role)) return json({ error: 'role inválido' }, 400)
      if (user_id === user.id) return json({ error: 'Você não pode alterar seu próprio papel' }, 400)
      const { error } = await adminClient.from('profiles').update({ role }).eq('id', user_id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    case 'set_banned': {
      const { user_id, banned } = body
      if (!user_id) return json({ error: 'user_id obrigatório' }, 400)
      if (user_id === user.id) return json({ error: 'Você não pode desativar sua própria conta' }, 400)
      const { error } = await adminClient.auth.admin.updateUserById(user_id, {
        ban_duration: banned ? '876600h' : 'none',
      })
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    case 'delete': {
      const { user_id } = body
      if (!user_id) return json({ error: 'user_id obrigatório' }, 400)
      if (user_id === user.id) return json({ error: 'Você não pode deletar sua própria conta' }, 400)
      const { error } = await adminClient.auth.admin.deleteUser(user_id)
      if (error) return json({ error: error.message }, 500)
      return json({ ok: true })
    }

    default:
      return json({ error: 'Ação desconhecida' }, 400)
  }
})

# Publicação gratuita no Netlify

## Configuração do site

1. Crie uma conta no Netlify e escolha **Add new project > Import an existing project**.
2. Conecte o repositório Git do projeto.
3. Use estas configurações (já versionadas em `netlify.toml`):
   - Build command: `npm run build`
   - Publish directory: `dist`
   - Node: `20`
4. Cadastre no Netlify, em **Project configuration > Environment variables**, somente:

```text
VITE_SUPABASE_URL=https://aglxvhsznwbmzithcvbb.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<chave publishable do projeto>
```

Não cadastre `SUPABASE_SERVICE_ROLE_KEY`, senha do banco ou token pessoal no Netlify. A chave publishable pode ser entregue ao navegador; a proteção real fica no Auth e no RLS.

## Configuração do Supabase Auth

Depois de obter a URL gratuita do site, por exemplo `https://nome-do-site.netlify.app`:

1. Em Auth > URL Configuration, defina essa URL como **Site URL**.
2. Adicione como Redirect URL:
   - `https://nome-do-site.netlify.app`
   - `https://nome-do-site.netlify.app/reset-password`
3. Mantenha o cadastro público desabilitado e MFA TOTP habilitado.

## Edge Function administrativa

Na máquina com o Supabase CLI autenticado e o projeto vinculado:

```bash
supabase functions deploy admin-invite-user
supabase secrets set AUTH_INVITE_REDIRECT_URL=https://nome-do-site.netlify.app/reset-password
```

Teste o convite com um usuário administrador real. A chave `service_role` deve permanecer somente nos secrets da função.

## Homologação antes de divulgar o endereço

- Abra o site em janela anônima e confirme login/MFA.
- Cadastre paciente, dieta, liberação e extra.
- Teste impressão e reimpressão da Elgin L42 Pro Full.
- Gere um relatório PDF por período.
- Teste um usuário operador, supervisor e administrador.
- Verifique o console do navegador e os logs do Netlify/Supabase.

O plano gratuito pode suspender o site ao atingir seus limites mensais. Acompanhe o consumo e mantenha o backup externo do Supabase Free.

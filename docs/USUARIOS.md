# Gestão segura de usuários

Quando o Supabase está configurado, a tela **Usuários** envia convites por e-mail através da Edge Function `admin-invite-user`. A chave `service_role` nunca fica no frontend.

## Publicação da função

Na máquina com o Supabase CLI autenticado e o projeto vinculado:

```bash
supabase functions deploy admin-invite-user
supabase secrets set AUTH_INVITE_REDIRECT_URL=https://SEU-DOMINIO/reset-password
```

Configure também no Supabase Auth o Site URL e o Redirect URL usados no convite. As variáveis `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas no ambiente da função; não devem ser copiadas para `.env.local` nem para o código React.

## Fluxo

1. Um administrador autenticado informa nome, e-mail, turno e papel.
2. A função valida o JWT e consulta `profiles` usando a chave de serviço.
3. Somente um perfil ativo com papel `administrador` pode continuar.
4. O Supabase Auth envia o convite e o usuário define a própria senha.
5. O perfil é gravado com o papel e o turno escolhidos.

Se a função ainda não tiver sido publicada, a tela exibirá o erro de configuração; publique-a antes da homologação.

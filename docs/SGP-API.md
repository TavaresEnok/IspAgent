{{url}}/api/central/contratos 

## Body  formdata 

cpfcnpj 

senha 

# SGP 

# Autenticações 

Básica 

Usuário e Senha do SGP, pode ser acessado em  Sistema -> Usuários 

Token 

Token gerado no SGP, pode ser acessado em  Sistema -> Ferramentas -> Painel Admin -> Tokens 

CPF/CNPJ e Senha (Central) 

CPF/CNPJ e Senha (Central) do Cliente, pode ser acessado na página do  Cliente -> Contratos -> Dados do 

Serviço -> Dados da Central do Assinante 

# Explicação das autenticações 

Para verificar mais detalhes de como funcionam os tipos de autenticação de nossa API, visite: 

https://bookstack.sgp.net.br/books/api/page/autenticacoes-via-api 

# Central Assinante 

# POST  Contrato - Listar 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente {{url}}/api/central/verificaacesso/ 

## Body  formdata 

cpfcnpj 

senha 

contrato 

{{url}}/api/central/extratouso/ 

## Body  formdata 

cpfcnpj 

senha 

contrato 

ano 

mes 

# POST  Serviço Internet – Verificar disponibilidade 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - ID do contrato 

# POST  Serviço Internet – Extrato de Tráfego 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

ano  integer  Ano 

mes  integer  Mês 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - ID do contrato 

[Obrigatório] - Ano da consulta 

[Obrigatório] - Mês da consulta {{url}}/api/central/promessapagamento/ 

## Body  formdata 

cpfcnpj 

senha 

contrato 

{{url}}/api/central/chamado/list/ 

# POST  Contrato – Liberação por Confiança 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - ID do contrato 

# POST  Chamado – Listar Body  formdata 

status :

0 = Aberta; 

1 = Encerrada; 

2 = Em execução; 

3 = Pendente. 

oc_status :

0 = Aberta; 

1 = Encerrada; 

2 = Em Execução; 

3 = Pendente. 

pop : Consultar endpoint URA "Pops": {{url}}/api/ura/pops/ 

Observações :

Data de Cadastro Inicial obrigatória caso Data de Cadastro Final informada. 

Data de Agendamento Inicial obrigatória caso Data de Agendamento Final informada. 

Data de Finalização Inicial obrigatória caso Data de Finalização Final informada. 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

cliente  integer  ID do Cliente 

os  integer  ID da Ordem de Serviço 

status  integer  ID do Status da Ordem de Serviço 

oc_status  integer  ID do Status da Ocorrência 

data_cadastro_inicio  string  Data de Cadastro Inicial da Ordem de Serviço, formato: "AAAA-MM-DD" 

data_cadastro_fim  string  Data de Cadastro Final da Ordem de Serviço, formato: "AAAA-MM-DD" 

data_agendamento_inicio  string  Data de Agendamento Inicial da Ordem de Serviço, formato: "AAAA-MM-DD" token 

app 

cpfcnpj 

senha 

contrato 

cliente 

os 

status 

oc_status 

pop 

data_cadastro_inicio 

data_cadastro_fim 

data_agendamento_inicio 

data_agendamento_fim 

data_finalizacao_inicio 

data_finalizacao_fim 

{{url}}/api/central/tipoocorrencia/list/ 

## Body  formdata 

token 

app 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

ID do contrato | Informar contrato ou cliente 

ID do cliente | Informar contrato ou cliente 

ID da ordem de serviço 

Status da ordem de serviço (Também responde por os_status) 

Status da ocorrência vinculada 

ID do POP vinculado à essa ordem de serviço 

Ordens de serviço geradas à partir de (formato: "AAAA-MM-DD") 

Ordens de serviço geradas até (formato: "AAAA-MM-DD") 

Ordens de serviço agendadas à partir de (formato: "AAAA-MM-DD") 

Ordens de serviço agendadas até (formato: "AAAA-MM-DD") 

Ordens de serviço finalizadas à partir de (formato: "AAAA-MM-DD") 

Ordens de serviço finalizadas até (formato: "AAAA-MM-DD") 

# POST  Tipos de Ocorrência – Listar 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha cpfcnpj 

senha 

{{url}}/api/central/chamado/ 

## Body  formdata 

token 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

# POST  Chamado – Criar 

ocorrenciatipo : Consultar endpoint "Tipos de Ocorrências": {{url}}/api/central/tipoocorrencia/list/ 

os_tecnico_responsavel : Consultar endpoint "Técnicos": {{url}}/api/ura/tecnicos/ 

os_prioridade :

1 = Baixa 

2 = Normal 

3 = Alta 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

conteudo  string  Conteúdo da OS 

contato  string  Contato 

contato_numero  string  Contato Número 

motivoos  integer  Motivo da OS 

sem_os  integer  Sem OS? 

setor  integer  ID do Setor da Ocorrência/OS 

ocorrenciatipo  integer  Código do Tipo da Ocorrência 

os_tecnico_responsavel  string/integer  ID ou username do Técnico Responsável 

os_servico_prestado  string  Serviço Prestado da OS 

os_prioridade  integer  Prioridade da OS 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha app 

cpfcnpj 

senha 

contrato 

conteudo 

contato 

contato_numero 

ocorrenciatipo 

setor 

responsaveloc 

motivoos 

sem_os 

os_tecnico_responsavel 

os_servico_prestado 

os_prioridade 

data_hora_agendamento 

{{url}}/api/central/chamado/update/{os_id}/ 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - ID do contrato 

Conteúdo da ocorrência e ordem de serviço 

Nome do contato na ocorrência 

Número do contato na ocorrência 

Código do tipo de ocorrência 

ID do setor da ocorrência e ordem de serviço 

Usuário do responsável da ocorrência 

Código do motivo da ordem de serviço 

Impede a geração de uma ordem de serviço 

ID ou Usuário do técnico da ordem de serviço 

Serviço prestado da ordem de serviço 

Prioridade da ordem de serviço (1=Baixa;2=Normal;3=Alta; Padrão 2) 

Data de agendamento da ocorrência e ordem de serviço (formato: "AAAA-MM-DD HH:MM") 

# POST  Chamado – Atualizar Body  formdata 

token 

app 

cpfcnpj 

senha 

ocorrencia_conteudo 

ocorrencia_encerrar 

os servico prestado 

os_tecnico_responsavel : Consultar endpoint "Técnicos": {{url}}/api/ura/tecnicos/ 

os_prioridade :

1 = Baixa 

2 = Normal 

3 = Alta 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

os_anotacao  string  Anotação da OS 

os_observacao  string  Observação da OS 

os_data_agendamento  string  Data de Agendamento da OS 

os_status  integer  Status da OS 

ocorrencia_conteudo  string  Conteúdo da Ocorrência 

ocorrencia_encerrar  integer  Encerrar Ocorrência? 

os_tecnico_responsavel  string/integer  ID ou username do Técnico Responsável 

os_servico_prestado  string  Serviço Prestado da OS 

os_setor  integer  ID do Setor da OS 

os_motivo  integer  Código do Motivo da OS 

os_prioridade  integer  Prioridade da OS 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

Substitui o campo Conteúdo da ocorrência 

Encerra a ocorrência caso a mesma tenha apenas uma ordem de serviço, e ela esteja encerrada 

Substitui o campo Serviço Prestado da ordem de serviço os_servico_prestado 

os_observacao 

os_anotacao 

os_data_agendamento 

os_status 

os_tecnico_responsavel 

os_setor 

os_motivo 

os_prioridade 

notificar_cliente 

{{url}}/api/central/chamado/{os_id}/anexo/add/ 

## Body  formdata 

token 

app 

cpfcnpj 

senha 

Substitui o campo Serviço Prestado da ordem de serviço 

Substitui o campo Observação da ordem de serviço 

Substitui o campo Observação Interna da ordem de serviço 

Substitui a data de agendamento da ordem de serviço (formato: "AAAA-MM-DD HH:MM") 

Altera o status da ordem de serviço (0=Aberta;1=Encerrada;2=Em execução;3=Pendente) 

Substitui o técnico da ordem de serviço. Utilizar ID ou Usuário 

Substitui o setor da ordem de serviço. Utilizar ID 

Substitui o motivo da ordem de serviço. Utilizar Código 

Substitui a prioridade da ordem de serviço (1=Baixa;2=Normal;3=Alta;) 

Dispara um aviso de encerramento da ocorrência/ordem de serviço ao cliente. Valor 1 para ativar 

# POST  Chamado – Adicionar Anexo 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

file  file  Anexo 

file_b64  string  Formato Base64 

descricao  string  Descrição do Anexo 

filename  string  Nome do anexo com a extensão 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

|file 

file_b64 

descricao 

filename 

{{url}}/api/central/chamado/{os_id}/anotacao 

## Body  formdata 

cpfcnpj 

senha 

anotacao 

{{url}}/api/central/notafiscal/list/ 

## Body  formdata 

[Obrigatório] - Arquivo que será anexado | Utilizar file ou file_b64 

[Obrigatório] - Arquivo, em base64, que será anexado | Utilizar file ou file_b64 

Descrição do anexo 

Nome do anexo caso feito via file_b64. Se não informar, será criado um nome no padrão anexo_... 

# POST  Ordem de Serviço – Adicionar Anotação 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

anotacao  string  Anotação do Chamado 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - Anotação a ser criada 

# POST  Nota Fiscal – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato (obrigatório) y

token 

app 

cpfcnpj 

senha 

contrato 

{{url}}/api/central/nfse/list/ 

## Body  formdata 

token 

app 

cpfcnpj 

senha 

contrato 

{{url}}/api/central/titulos/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - ID do contrato que possui as notas vinculadas 

# POST  NFSe – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - ID do contrato que possui as notas vinculadas 

# POST  Fatura – Listar Body  formdata 

token 

app 

cpfcnpj 

senha 

contrato 

offset 

limit 

status 

imprimir_nota_fiscal 

imprimir_nota_debito 

{{url}}/api/central/fatura2via/ 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

Retorna títulos desse contrato. Se não informado, retornará do cpf/cnpj informado no parâmetro cpfcnpj 

Deslocamento da consulta (a partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 250) 

Retorna títulos apenas com o status informado (1=Em aberto;2=Pago;3=Cancealdo; Padrão = 1 e 2) 

Retorna as notas fiscais modelos 21 e 22 atreladas à esses títulos 

Retorna as notas de débito atreladas à esses títulos 

# POST  Fatura – Segunda via 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

nao_gerar_os  integer  Não Gerar OS Body  formdata 

cpfcnpj 

senha 

contrato 

nao_gerar_os 

{{url}}/api/central/pagamento/pix/{id_titulo} 

## Body  formdata 

cpfcnpj 

senha 

contrato 

{{url}}/api/central/envia2via/ 

## Body  formdata 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - ID do contrato 

Não gera ocorrência no cliente mediante disparo desse endpoint 

# POST  Fatura – Gerar PIX 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - ID do contrato 

# POST  Fatura – Enviar 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

email  string  Email cpfcnpj 

senha 

contrato 

tipo 

email 

celular 

{{url}}/api/central/pagamento/cartao/{titulo_id} 

## Body  formdata 

token 

app 

cpfcnpj 

senha 

[Obrigatório] - CPF / CNPJ do cliente 

[Obrigatório] - Senha de acesso à central do cliente 

[Obrigatório] - ID do contrato 

Método do disparo, aceita "email" ou "sms" (sms também é tratado como whatsapp). Padrão: "email" 

Solicita, caso o tipo seja "email", o disparo para esse email informado ao invés do email do contrato 

Solicita, caso o tipo seja "sms", o disparo para esse celular informado ao invés do celular do contrato 

# POST  Fatura - Pagar via Cartão de Crédito 

Pagamento da fatura via cartão. Necessário consultar api listar titulos antes para pegar o ID do título que desejar pagar no cartão. 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

nome  string  Nome 

numero  integer  Número 

expira  string  Expira 

cvv  integer  CVV 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha contrato 

nome 

numero 

expira 

cvv 

cartao_id 

{{url}}/api/central/pagamento/cartao/{titulo_id}/debito/ 

## Body  formdata 

token 

app 

cpfcnpj 

senha 

contrato 

[Obrigatório] - ID do contrato 

[Obrigatório] - Nome impresso no cartão | Informar esse ou o ID do cartão 

[Obrigatório] - Número do cartão | Informar esse ou o ID do cartão 

[Obrigatório] - Expiração do cartão (formato: MM/AAAA) | Informar esse ou o ID do cartão 

[Obrigatório] - Código de segurança do cartão | Informar esse ou o ID do cartão 

[Obrigatório] - ID do cartão do cliente cadastrado no SGP | Informar esse ou os dados do cartão 

# POST  Fatura - Pagar via Cartão de Débito 

Pagamento da fatura via cartão. Necessário consultar api listar titulos antes para pegar o ID do título que desejar pagar no cartão. 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

nome  string  Nome 

numero  integer  Número 

expira  string  Expira 

cvv  integer  CVV 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - ID do contrato nome 

numero 

expira 

cvv 

cartao_id 

{{url}}/api/central/pagamento/checkout/{titulo_id}/cartao/ 

## Body  formdata 

token 

app 

cpfcnpj 

senha 

contrato 

{{url}}/api/centralapp/gatewaycartao/list/ 

[Obrigatório] - Nome impresso no cartão | Informar esse ou o ID do cartão 

[Obrigatório] - Número do cartão | Informar esse ou o ID do cartão 

[Obrigatório] - Expiração do cartão (formato: MM/AAAA) | Informar esse ou o ID do cartão 

[Obrigatório] - Código de segurança do cartão | Informar esse ou o ID do cartão 

[Obrigatório] - ID do cartão do cliente cadastrado no SGP | Informar esse ou os dados do cartão 

# POST  Fatura - Pagar via Cartão Checkout 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CPF / CNPJ do Cliente 

senha  string  Senha do Cliente 

contrato  integer  ID do Contrato 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - CPF / CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - ID do contrato 

# POST  Gateway Cartão - Listar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/centralapp/cadastrarcartao/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Parâmetro  Tipo  Descrição 

token  string  Token do aplicativo da central do assinante [obrigatório] 

login  string  Login do contrato [obrigatório] 

contrato  string  Id do Contrato [obrigatório] 

# POST  Cartão de Crédito - Cadastrar 

Parâmetro  Tipo  Descrição 

token  string  Token do aplicativo da central do assinante [obrigatório] 

login  string  Login do contrato [obrigatório] 

contrato  integer  Id do Contrato [obrigatório] 

mes_expira  integer  Mês de expiração do cartão MM [obrigatório] 

ano_expira  integer  Ano de expiração do cartão no formato YYYY [obrigatório] 

numero  string  Número do cartão [obrigatório] 

cvv  string  CVV do cartão [obrigatório] 

Nome conforme está no cartão  string  Nome conforme está no cartão [obrigatório] 

payment_token  string  Token de pagamento caso a gateway exija o token 

cobranca_recorrente  string  Caso desejar adicionar este cartão como cobrança recorrente Password  {{password}} 

{{url}}/api/centralapp/deletecartao/{id_cartao}/ 

## Body  formdata 

token 

contrato 

login 

password 

# DELETE  Cartão de Crédito - Delete 

O dado informado em login depende do Modo de Autenticação escolhido ao configurar o Central App na interface do SGP: 

## Modo de autenticação: 

CPF/CNPJ e Login (Qualquer um pode ser utilizado no campo login) 

CPF/CNPJ (Deve ser informado o CPF/CNPJ no campo login) 

Login (Deve ser informado o login da central no campo login) 

## Exigir senha ?: 

Caso ativado, é necessário também informar a senha da central no parâmetro password 

Parâmetro  Tipo  Descrição 

token  string  Token do aplicativo da central do assinante [obrigatório] 

contrato  integer  Id do Contrato [obrigatório] 

login  string  Login ou CPF/CNPJ do contrato (Consulte explicação abaixo) do contrato [obrigatório] 

password  string  Senha de acesso à central (Consulte explicação abaixo) 

Token do aplicativo da central do assinante [obrigatório] 

Id do Contrato [obrigatório] 

Login ou CPFCNPJ do contrato (Depende do modo de autenticação, ver Doc.) [obrigatório] 

Senha de autenticação da central (Depende do modo de autenticação, ver Doc.) {{url}}/api/centralapp/cartao/{id_cartao}/cobrancarecorrente/add/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/centralapp/cartao/{id_cartao}/cobrancarecorrente/delete/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/banco/remessa/download/ 

# POST  Cobrança Recorrente - Cadastrar 

Parâmetro  Tipo  Descrição 

token  string  Token do aplicativo da central do assinante [obrigatório] 

login  string  Login do contrato [obrigatório] 

contrato  integer  Id do Contrato [obrigatório] 

# POST  Cobrança Recorrente - Delete 

Parâmetro  Tipo  Descrição 

token  string  Token do aplicativo da central do assinante [obrigatório] 

login  string  Login do contrato [obrigatório] 

contrato  integer  Id do Contrato [obrigatório] 

# Remessa / Retorno 

# POST  Download Remessa Body  formdata 

token 

app 

portador 

modelo_arquivo 

ocorrencias 

data_inicial 

data_final 

data_emissao_inicial 

data_emissao_final 

status 

pop 

status_baixa 

{{url}}/api/banco/retorno/upload/ 

## Body  formdata 

app 

token 

portador 

arquivo 

previewcheck 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha 

[Obrigatório] - ID do portador 

[Obrigatório] - CNAB da remessa, escolhas são "CNAB240" ou "CNAB400" 

[Obrigatório] - Código de movimentação dos títulos da remessa, ex: 01 = registro; 02 = baixa; 

[Obrigatório] - Títulos com vencimento à partir de (formato: "AAAA-MM-DD") 

[Obrigatório] - Títulos com vencimento até (formato: "AAAA-MM-DD") 

Títulos gerados à partir de (formato: "AAAA-MM-DD") 

Títulos gerados até (formato: "AAAA-MM-DD") 

Status do contrato que possui os títulos. Escolhas: 1=Ativo;2=Inativo;3=Cancelado;4=Suspenso;7=Reduzido 

ID do POP que o contrato (detentor dos títulos) deve possuir 

Incluirá também na remessa de baixa (ocorrencias 02) títulos em aberto 

# POST  Upload Retorno 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - ID do portador que receberá o retorno 

[Obrigatório] - Arquivo de retorno, necessário anexar no endpoint 

Não processa o retorno, dando apenas um feedback da anexação 

# FTTH 

Existem duas formas de se autenticar na api FTTH: {{url}}/api/fttx/olt/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/fttx/olt/{olt_id}/pon/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/fttx/olt/{olt_id}/onu/list/ 

p

Basic Auth : (usuário e senha do SGP) 

APP e Token:  Conjunto de app e token gerados no SGP com mapeamento do token para um usuário do SGP 

# GET  Listar OLT 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Listar PON 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Listar ONU por OLT AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

onuid 

onuidreal 

slot 

pon 

phy_addr 

cpfcnpj 

contrato 

servico 

status 

Parâmetro  Tipo  Descrição 

onuid  integer  ID da ONU 

onuidreal  integer  ONUID da ONU 

slot  integer  Slot da ONU 

pon  integer  PON da ONU 

phy_addr  string  PHY_ADDR da ONU 

cpfcnpj  string  CPF/CNPJ do Cliente 

contrato  integer  ID do Contrato 

servico  integer  ID do Serviço 

status  integer  IDs dos Status (separados por vírgula) 

login  string  Login do Serviço 

address  integer  Exibe Informação de Endereço no resultado 

signal  integer  Exibe Informação de sinal no resultado 

ID da ONU (ID do Objeto) 

ONUID da ONU 

Slot da PON 

PON da ONU 

Phy Address da ONU 

CPF ou CNPJ do cliente vinculado à ONU 

ID do contrato do cliente vinculado à ONU 

ID do serviço vinculado à ONU 

Status do serviço vinculado à ONU (valores: 1=Ativo;2=Inativo;3=Cancelado;4=Suspenso;5=Reduzido) login 

address 

signal 

connection 

## Body  formdata 

token 

app 

1 Ativo;2 Inativo;3 Cancelado;4 Suspenso;5 Reduzido) 

Login vinculado à ONU 

Exibe o endereço vinculado ao serviço da ONU 

Exibe informações da coleta de sinal da ONU 

Retorna a situação da conexão (Ex.: Online) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth {{url}}/api/fttx/onu/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

onuid 

slot 

pon 

phy_addr 

cpfcnpj 

# GET  Listar ONU 

Parâmetro  Tipo  Descrição 

onuid  integer  ID da ONU 

slot  integer  Slot da ONU 

pon  integer  PON da ONU 

phy_addr  string  PHY_ADDR da ONU 

cpfcnpj  string  CPF/CNPJ do Cliente 

contrato  integer  ID do Contrato 

servico  integer  ID do Serviço 

status  integer  IDs dos Status (separados por vírgula) 

login  string  Login do Serviço 

address  integer  Exibe Informação de Endereço no resultado 

signal  integer  Exibe Informação de sinal no resultado 

connection  integer  Exibe Informação de "online" no resultado 

ID da ONU 

Slot da PON 

PON da ONU 

Phy Address da ONU 

CPF ou CNPJ do cliente vinculado à ONU contrato 

servico 

status 

login 

address 

signal 

connection 

## Body  formdata 

token 

app 

{{url}}/api/fttx/olt/pon/{OLT_ID}/splitter/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

pon 

slot 

## Body  formdata 

token 

ID do contrato do cliente vinculado à ONU 

ID do serviço vinculado à ONU 

Status do serviço vinculado à ONU (valores: 1=Ativo;2=Inativo;3=Cancelado;4=Suspenso;5=Reduzido) 

Login vinculado à ONU 

Exibe o endereço vinculado ao serviço da ONU 

Exibe informações da coleta de sinal da ONU 

Retorna a situação da conexão (Ex.: Online) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Listar CTO utilizadas na OLT 

Parâmetro  Tipo  Descrição 

pon  integer  PON da CTO 

slot  integer  Slot da CTO 

PON da CTO 

Slot da CTO 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth app 

{{url}}/api/fttx/splitter/{cto_id}/onu/all/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

onuid 

slot 

pon 

phy_addr 

cpfcnpj 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Listar ONUs vinculadas a CTO 

Parâmetro  Tipo  Descrição 

onuid  integer  ID da ONU 

slot  integer  Slot da ONU 

pon  integer  PON da ONU 

phy_addr  string  PHY_ADDR da ONU 

cpfcnpj  string  CPF/CNPJ do Cliente 

contrato  integer  ID do Contrato 

servico  integer  ID do Serviço 

status  integer  IDs dos Status (separados por vírgula) 

login  string  Login do Serviço 

address  integer  Exibe Informação de Endereço no resultado 

signal  integer  Exibe Informação de sinal no resultado 

connection  integer  Exibe Informação de "online" no resultado 

ID da ONU 

Slot da PON 

PON da ONU 

Phy Address da ONU 

CPF ou CNPJ do cliente vinculado à ONU contrato 

servico 

status 

login 

address 

signal 

connection 

## Body  formdata 

token 

app 

{{url}}/api/fttx/splitter/{id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

no_busy_ports 

{{url}}/api/fttx/splitter/all/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

ID do contrato do cliente vinculado à ONU 

ID do serviço vinculado à ONU 

Status do serviço vinculado à ONU (valores: 1=Ativo;2=Inativo;3=Cancelado;4=Suspenso;5=Reduzido) 

Login vinculado à ONU 

Exibe o endereço vinculado ao serviço da ONU 

Exibe informações da coleta de sinal da ONU 

Retorna a situação da conexão (Ex.: Online) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Listar CTO 

Retorna as CTOs sem buscar as portas ocupadas (Endpoint executa mais rápido) 

# GET  Listar todas CTO PARAMS 

no_busy_ports 

## Body  formdata 

token 

app 

{{url}}/api/fttx/olt/{olt_id}/unauth/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/fttx/olt/{olt_id}/auth/ 

Retorna as CTOs sem buscar as portas ocupadas (Endpoint executa mais rápido) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Listar ONUs não autorizadas 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Autorizar ONU AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

slot 

pon 

contrato 

service 

description 

onutemplate 

Parâmetro  Tipo  Descrição 

slot  integer  Número do slot 

pon  integer  Número do PON 

id  integer  Serial/Mac da ONU 

onutype  integer  Código do tipo da ONU 

vlan  integer  Vlan 

mode  integer  BRIDGE = 1; PPPOE = 2; BRIDGE_WAN = 3; DHCP = 4 

service  integer  Login do Cliente 

onutemplate  integer  ID do template. Não enviar caso não possua 

description  string  Descrição 

ident  string  Etiqueta 

splitter  integer  ID do Splitter 

splitter_port  integer  Porta do Splitter 

pppoe login  string  Login do PPPOE 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Slot da OLT que será autorizada 

[Obrigatório] - PON em que será autorizada 

[Obrigatório] - ID do contrato | Utilizar contrato e/ou service e/ou description 

[Obrigatório] - Login do cliente | Utilizar contrato e/ou service e/ou description 

[Obrigatório] - Descrição da ONU | Utilizar contrato e/ou service e/ou description 

[Obrigatório] - ID do ONU Template a ser utilizado onutemplate_plain 

splitter 

splitter_port 

id 

onutype 

mode 

vlan 

ident 

pppoe_login 

pppoe_password 

wifi_ssid 

wifi_password 

wifi_channel 

wifi_ssid5 

wifi_password5 

wifi_channel5 

wifi_authmode 

wifi_encrypttype 

wifi_central 

onu_web 

onu_web_port 

onu_telnet 

onu_login 

onu_password 

no_auth 

onuid 

{{ l}}/ i/f / /{id }/ /

Retira a necessidade de informar o onutemplate 

[Obrigatório] - ID da CTO | Utilizar splitter ou splitter_port + pon + slot 

[Obrigatório] - Porta da CTO | Utilizar splitter ou splitter_port + pon + slot 

[Obrigatório] - Phy Address que será gravada na ONU 

[Obrigatório] - Código do tipo da ONU 

[Obrigatório] - BRIDGE = 1; PPPOE = 2; BRIDGE_WAN = 3; DHCP = 4; 

VLAN 

Etiqueta da ONU 

Login do serviço 

Senha do serviço 

Nome da rede Wifi 

Senha da rede Wifi 

Canal da rede Wifi 

Nome da rede Wifi (5GHz) 

Senha da rede Wifi (5GHz) 

Canal da rede Wifi (5GHz) 

Modo de autenticação da Wifi 

Criptografia da Wifi 

Permite gerenciar a wifi na central do assinante 

Habilita a alteração da ONU via Web 

Define a porta da interface web de alteração da ONU (Padrão: 80) 

Habilita Telnet 

Login WAN da ONU 

Senha WAN da ONU 

Permitir registrar a ONU sem autorizar na OLT atraves da api | Se usar, necessário informar onuid 

Posição da ONU caso esteja utilizando com o parâmetro no_auth 

# GET  Resetar ONU {{url}}/api/fttx/onu/{id_onu}/reset/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

default_cfg 

## Body  formdata 

token 

app 

{{url}}/api/fttx/olt/{olt_id}/onu/export/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/fttx/onu/{id onu}/info/ 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

default_cfg  integer  Configuração padrão 

Reset para configuração padrão 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Exportar ONU 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  ONU Info {{url}}/api/fttx/onu/{id_onu}/info/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/fttx/onu/{id_onu}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/fttx/onu/{onu_id}/edit/ 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  ONU Detalhe 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Alterar ONU 

onu_update = "wifi": AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

onu_update 

wifi_ssid 

wifi_password 

wifi_channel 

wifi_ssid5 

wifi_password5 

onu_update = "wan": 

onu_update = "service": 

Parâmetro  Tipo  Descrição 

wifi_ssid  string  wifi_ssid 

wifi_password  string  wifi_password 

wifi_ssid5  string  wifi_ssid5 

wifi_password5  string  wifi_password5 

wifi_central  string  wifi_central 

Parâmetro  Tipo  Descrição 

onu_web  string  onu_web 

onu_telnet  string  onu_telnet 

onu_login  string  onu_login 

onu_password  string  onu_password 

Parâmetro  Tipo  Descrição 

service  string  Login do Serviço 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Informar o que deseja alterar. Escolhas: 'wifi' , 'wan' , 'service' 

Nome da rede Wifi ('wifi') 

Senha da rede Wifi ('wifi') 

Canal da rede Wifi ('wifi') 

Nome da rede Wifi (5GHz) ('wifi') 

Senha da rede Wifi (5GHz) ('wifi') wifi_channel5 

wifi_central 

onu_web 

onu_telnet 

onu_login 

onu_password 

service 

{{url}}/api/fttx/onu/{id_onu}/deauth/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

no_commit 

## Body  formdata 

token 

app 

{{url}}/api/fttx/onu/{id_onu}/deauth/ 

Canal da rede Wifi (5GHz) ('wifi') 

Permite gerenciar a wifi na central do assinante ('wifi') 

Habilita a alteração da ONU via Web ('wan') 

Habilita Telnet ('wan') 

Login WAN da ONU ('wan') 

Senha WAN da ONU ('wan') 

Login do serviço que deseja vincular a ONU ('service') 

# GET  Remover ONU 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

no_commit  integer  Remover ONU sem desautorizar na OLT 

Remover ONU sem desautorizar na OLT 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Remover ONU AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

no_commit 

## Body  formdata 

token 

app 

{{url}}/api/fttx/onu/{identificador_onu}/wifi/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

remove 

## Body  formdata 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

no_commit  integer  Remover ONU sem desautorizar na OLT 

Remover ONU sem desautorizar na OLT 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  ONU Wifi 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

remove  integer  remove 

Remove a Wifi pelo template configurado token 

app 

{{url}}/api/fttx/onu/{identificador_onu}/wan/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

remove 

## Body  formdata 

token 

app 

{{url}}/api/fttx/onu/{IDENTIFICADOR_ONU}/cmd/{CMD_ID}/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  ONU WAN 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

remove  integer  remove 

Se enviado, chama o comando de remover WAN 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  ONU CMD 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

cmdrun  string  cmdrun 

cmd_print_result  string  cmd_print_result {{url}}/api/fttx/onu/{IDENTIFICADOR_ONU}/cmd/{CMD_ID}/ 

{{url}}/api/fttx/onu/{IDENTIFICADOR_ONU}/tl1/cmd/ 

{{url}}/api/fttx/onu/history/ 

{{url}}/api/fttx/splitter/add/ 

regex_search  string  regex_search 

# POST  ONU CMD 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

cmdrun  string  cmdrun 

cmd_print_result  string  cmd_print_result 

regex_search  string  regex_search 

# GET  ONU TL1 CMD 

{IDENTIFICADOR_ONU} : Pode ser o ID ou o Serial da ONU. 

Parâmetro  Tipo  Descrição 

action  string  Valores: "add"; "delete"; 

# GET  ONU Histórico 

Parâmetro  Tipo  Descrição 

phy_addr  string  phy_addr 

service  integer  ID do Serviço 

# POST  Cadastrar CTO {{url}}/api/fttx/onutemplate/list/ 

{{url}}/api/fttx/onutype/list/ 

{{url}}/api/fttx/onumode/list/ 

{{url}}/api/fttx/service/list/ 

Parâmetro  Tipo  Descrição 

pon_id  integer  ID da PON 

identificacao  string  Nome da CTO 

portas  integer  Número de portas 

streetpole_id  integer  ID do Poste 

latitude  string  Latitude da CTO 

longitude  string  Longitude da CTO 

verificar_portas  integer  Verificar Portas? 

limitar_portas  integer  Limitar Portas? 

tipo_conector  integer  Tipo do Conector 

localizacao  integer  Localização da CTO 

observacao  integer  Observação da CTO 

verificar_pon  integer  Verificar PON? 

# GET  ONU Template 

# GET  ONU Tipo 

# GET  ONU Modo 

# GET  Serviços {{url}}/ws/fttx/splitter/service/add/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

{{url}}/api/estoque/empresa/list/ 

Parâmetro  Tipo  Descrição 

login  string  Login do Serviço 

contrato  integer  ID do Contrato 

# POST  Adicionar CTO ao Serviço 

Parâmetro  Tipo  Descrição 

service_id  integer  Id do seriço de internet [Obrigatório] 

splitter_id  integer  Id da CTO [Obrigatório] 

splitter_port  integer  Porta da CTO [Obrigatório] 

# Estoque 

# Autenticações 

Básica 

Usuário e Senha do SGP, pode ser acessado em  Sistema -> Usuários 

# GET  Empresa – Listar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

cfpcnpj 

cpfcnpj 

{{url}}/api/estoque/fornecedor/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

cpfcnpj 

nome 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CNPJ da Empresa 

nome  string  Nome Fantasia / Razão Social da Empresa 

CNPJ da Empresa 

Nome Fantasia ou Razão Social da Empresa 

# GET  Fornecedor – Listar 

Parâmetro  Tipo  Descrição 

cpfcnpj  string  CNPJ do Fornecedor 

nome  string  Nome Fantasia / Razão Social do Fornecedor 

CPF ou CNPJ do fornecedor 

Nome ou Nome Fantasia {{url}}/api/estoque/categoria/list/?nome 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

nome 

{{url}}/api/estoque/fabricante/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

nome 

{{url}}/api/estoque/ncm/list/ 

# GET  Categoria – Listar 

Parâmetro  Tipo  Descrição 

nome  string  Nome da Categoria 

Nome da categoria 

# GET  Fabricante – Listar 

Parâmetro  Tipo  Descrição 

nome  string  Nome do Fabricante 

Nome do fabricante 

# GET  NCM – Listar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

codigo 

descricao 

{{url}}/api/estoque/kitinstalacao/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

descricao 

{{url}}/api/estoque/kitinstalacaoproduto/list/ 

Parâmetro  Tipo  Descrição 

codigo  string  Código do NCM 

descricao  string  Descrição do NCM 

Código do NCM 

Descrição do NCM 

# GET  Kit de Instalação – Listar 

Parâmetro  Tipo  Descrição 

descricao  string  Descrição do Kit de Instalação 

Descrição do Kit de Instalação 

# GET  Produtos de Kit – Listar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

kitinstalacao_id 

{{url}}/api/estoque/comodato/list/ 

Parâmetro  Tipo  Descrição 

kitinstalacao_id  string  ID do Kit de Instalação (Obrigatório) 

[Obrigatório] - ID do Kit de Instalação 

# GET  Comodato de Cliente – Listar 

(*) Necessário informar ao menos 1 entre os parâmetros: cliente_id, clientecontrato_id, ordemservico_id, datas de cadastro (ini/fim) 

data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. 

status :

Parâmetro  Tipo  Descrição 

cliente_id  string  ID do Cliente *(Obrigatório) 

clientecontrato_id  string  ID do Contrato *(Obrigatório) 

ordemservico_id  string  ID da Ordem de Serviço * (Obrigatório) 

data_cadastro_ini  string  Data de Cadastro Inicial do Comodato, formato: "AAAA-MM-DD" *(Obrigatório) 

data_cadastro_fim  string  Data de Cadastro Final do Comodato, formato: "AAAA-MM-DD" *(Obrigatório) 

status  string  Status 

data_estorno_ini  string  Data Inicial do Estorno 

data_estorno_fim  string  Data Final do Estorno AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

cliente_id 

clientecontrato_id 

ordemservico_id 

status 

data_cadastro_ini 

data_cadastro_fim 

{{url}}/api/estoque/comodatoitens/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

1 = Aberto; 

2 = Ativo; 

3 = Devolvido; 

4 = Cancelado. 

ID do cliente vinculado ao comodato | Utilizar ao menos um dos filtros 

ID do contrato de serviço vinculado ao comodato | Utilizar ao menos um dos filtros 

ID da ordem de serviço vinculada | Utilizar ao menos um dos filtros 

Status do Comodato (1=Aberto;2=Ativo;3=Devolvido;4=Cancelado) | Utilizar ao menos um dos filtros 

Data de cadastro inicial. Utilizar junto com a final (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

Data de cadastro final. Utilizar junto com a inicial (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

# GET  Itens da Comodato – Listar 

Parâmetro  Tipo  Descrição 

comodato_id  string  ID do Comodato (Obrigatório) comodato_id 

{{url}}/api/estoque/venda/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

cliente_id 

[Obrigatório] - ID do comodato 

# GET  Venda de Cliente – Listar 

(*) Necessário informar ao menos 1 entre os parâmetros: cliente_id, clientecontrato_id, ordemservico_id, datas de cadastro (ini/fim) 

data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. 

status :

1 = Aberto; 

2 = Ativo; 

3 = Devolvido; 

4 = Cancelado. 

Parâmetro  Tipo  Descrição 

cliente_id  string  ID do Cliente *(Obrigatório) 

clientecontrato_id  string  ID do Contrato *(Obrigatório) 

ordemservico_id  string  ID da Ordem de Serviço * (Obrigatório) 

data_cadastro_ini  string  Data de Cadastro Inicial da Venda, formato: "AAAA-MM-DD" *(Obrigatório) 

data_cadastro_fim  string  Data de Cadastro Final da Venda, formato: "AAAA-MM-DD" * (Obrigatório) 

status  string  Status 

data_estorno_ini  string  Data Inicial do Estorno 

data_estorno_fim  string  Data Final do Estorno 

ID do cliente vinculado à venda | Utilizar ao menos um dos filtros clientecontrato_id 

ordemservico_id 

status 

data_cadastro_ini 

data_cadastro_fim 

{{url}}/api/estoque/vendaitens/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

venda_id 

{{url}}/api/estoque/lancamento/list/ 

ID do contrato de serviço vinculado à venda | Utilizar ao menos um dos filtros 

ID da ordem de serviço vinculada | Utilizar ao menos um dos filtros 

Status da Venda (1=Aberto;2=Ativo;3=Devolvido;4=Cancelado) | Utilizar ao menos um dos filtros 

Data de cadastro inicial. Utilizar junto com a final (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

Data de cadastro final. Utilizar junto com a inicial (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

# GET  Itens da Venda – Listar 

Parâmetro  Tipo  Descrição 

venda_id  string  ID da Venda 

[Obrigatório] - ID da venda 

# GET  Lançamento – Listar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

cliente_id 

clientecontrato_id 

(*) Um dos 6 parâmetros é obrigatório. 

data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. 

## Legenda 

tipo :

2 = Compra; 

3 = Venda; 

4 = Comodato; 

5 = Transferência; 

6 = O.S.; 

7 = O.S. Estorno; 

8 = Correção de Entrada; 

9 = Correção de Saída; 

10 = Compra Estorno; 

11 = Venda Estorno; 

12 = Comodato Estorno; 

Parâmetro  Tipo  Descrição 

cliente_id  integer  ID do Cliente (*) 

clientecontrato_id  integer  ID do Contrato (*) 

ordemservico_id  integer  ID da Ordem de Serviço (*) 

tipo  integer  Tipo do lançamento (*) 

data_cadastro_ini  string  Data de Cadastro Inicial do Lançamento, formato: "AAAA-MM-DD" (*) 

data_cadastro_fim  string  Data de Cadastro Final do Lançamento, formato: "AAAA-MM-DD" (*) 

ID do cliente vinculado ao lançamento | Utilizar ao menos um dos filtros 

ID do contrato de serviço vinculado ao lançamento | Utilizar ao menos um dos filtros ordemservico_id 

tipo 

data_cadastro_ini 

data_cadastro_fim 

{{url}}/api/estoque/lancamentoitem/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

cliente_id 

clientecontrato_id 

ordemservico_id 

lancamento_id 

contrato_id 

ID da ordem de serviço vinculada | Utilizar ao menos um dos filtros 

Tipo do lançamento. Consultar documentação pública para verificar os status possíveis | Utilizar ao menos um dos filtros 

Data de cadastro inicial. Utilizar junto com a final (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

Data de cadastro final. Utilizar junto com a inicial (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

# GET  Itens do Lançamento – Listar 

(*) Um dos 3 parâmetros é obrigatório. 

Parâmetro  Tipo  Descrição 

ordemservico_id  string  ID da Ordem de Serviço (*) 

lancamento_id  string  ID do Lançamento 

cliente_id  string  ID do Cliente (*) 

clientecontrato_id  string  ID do Contrato (*) 

ID do cliente vinculado ao lançamento | Utilizar ao menos um dos filtros 

ID do contrato de serviço vinculado ao lançamento | Utilizar ao menos um dos filtros 

ID da ordem de serviço vinculada | Utilizar ao menos um dos filtros 

ID do lançamento | Utilizar ao menos um dos filtros 

ID do contrato de serviço que possui destino ou origem vinculado ao lançamento | Utilizar ao menos um dos filtros 

# GET  L l d E t Li t {{url}}/api/estoque/estoque/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

descricao 

usuario 

{{url}}/api/estoque/estoque_agregado_referencias/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

estoque_id 

# GET  Local de Estoque – Listar 

Basic Auth  opcional com Username/Password para filtrar por usuário. 

Parâmetro  Tipo  Descrição 

usuario  string  Nome do Usuário 

descricao  string  Descrição do Estoque 

Consulta por nome do local de estoque 

Retorna apenas locais de estoque vinculados ao usuário da autenticação 

# GET  Saldo – Listar 

Parâmetro  Tipo  Descrição 

estoque_id  string  ID do Estoque 

produto_id  string  ID do Produto 

referencia  string  Valor da Referência do Produto 

ID do Local de Estoque | Utilizar ao menos um dos filtros q _

produto_id 

referencia 

{{url}}/api/estoque/produto/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

descricao 

{{url}}/api/estoque/produto/list/all/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

q |

ID do Produto | Utilizar ao menos um dos filtros 

Referência de um produto | Utilizar ao menos um dos filtros 

# GET  Produto – Listar (Quantitativos) 

Basic Auth  opcional com Username/Password para filtrar por usuário. 

Parâmetro  Tipo  Descrição 

descricao  string  Descrição do Produto 

Nome do produto 

# GET  Produto – Listar (Cadastrados) 

Basic Auth  opcional com Username/Password para filtrar por usuário. 

Parâmetro  Tipo  Descrição 

retornar_inativos  boolean  Caso enviado, retorna também produtos inativos. retornar_inativos  1

{{url}}/api/estoque/unidademedida/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

descricao 

sigla 

{{url}}/api/estoque/compra/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

Retorna, também, os produtos desativados. 

# GET  Unidades de Medidas - Listar 

Parâmetros URL: 

sigla; 

descricao. 

Descrição da unidade de medida 

Sigla da unidade de medida 

# GET  Compras - Listar 

Parâmetros URL: 

fornecedor_id (*); 

data_cadastro_ini (AAAA-MM-DD) (*); 

data_cadastro_fim (AAAA-MM-DD) (*). 

(*) Um dos 3 parâmetros é obrigatório. 

data_cadastro_ini e data_cadastro_fim são juntamente obrigatórios, se algum informado. PARAMS 

fornecedor_id 

data_cadastro_ini 

data_cadastro_fim 

{{url}}/api/estoque/compraitens/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

compra_id 

{{url}}/api/estoque/transferencia/list/ 

## PARAMS 

data_cadastro_ini 

ID do fornecedor | Utilizar ao menos um dos filtros 

Data de cadastro inicial. Utilizar junto com a final (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

Data de cadastro final. Utilizar junto com a inicial (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

# GET  Itens da Compra - Listar 

Parâmetros URL: 

compra_id 

[Obrigatório] - ID da compra 

# GET  Transferências - Listar 

Parâmetros URL: 

data_cadastro_ini (AAAA-MM-DD); 

data_cadastro_fim (AAAA-MM-DD). 

data_cadastro_ini e data_cadastro_fim são obrigatórios. 

[Obrigatório] - Data de cadastro inicial. Utilizar junto com a final (formato: "AAAA MM DD") | Utilizar ao menos um dos filtros data_cadastro_fim 

{{url}}/api/estoque/lancamentoitem/create/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

AAAA-MM-DD ) | Utilizar ao menos um dos filtros 

[Obrigatório] - Data de cadastro final. Utilizar junto com a inicial (formato: "AAAA-MM-DD") | Utilizar ao menos um dos filtros 

# POST  Lançamento – Criar 

(*) É um parâmetro obrigatório. 

Parâmetro  Tipo  Descrição 

itens  array  Array de produtos (*) 

origem_id  integer  ID da Origem (*) 

os_id  integer  ID da Ordem de Serviço 

cliente_id  integer  ID do Cliente 

clientecontrato_id  integer  ID do Contrato (*) 

comodato  integer  Cadastrar como Comodato 

json 

{

"os_id" : 1,

"cliente_id" : 1,

"clientecontrato_id" : 1,

"comodato" : 1,

"origem_id" : 1,

"itens" : [

{

"produto_id" : 1,

"quantidade" : 1,

"valor" : "1.11" ,

"referencia_id" : 1

}

]{{url}}/api/estoque/lancamentoitem/estorno/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

lancamentoitem_id 

local_id 

os_id 

observacao 

{{url}}/api/estoque/produto/create/ 

}

# POST  Estorno – Atualizar 

(*) É um parâmetro obrigatório. 

Parâmetro  Tipo  Descrição 

lancamentoitem_id  integer  ID do Lançamento Item (*) 

local_id  integer  ID do Local (*) 

os_id  integer  ID da Ordem de Serviço 

observacao  string  Observação 

[Obrigatório] - ID do item do lançamento 

[Obrigatório] - ID do local de estoque destino do retorno 

ID da ordem de serviço que será vinculada ao estorno 

Observação que será vinculada ao estorno 

# POST  Produto - Cadastrar tipo_referencia :

1 = MAC Address; 

2 = Serial; 

3 = Tombamento. 

ativo :

"0" = Não; 

"1" = Sim. 

Observação :

Se informado tipo de referência, passará a ser obrigatório informar uma referência única na entrada do produto no estoque. Exemplo: API Compras. 

categorias :

Consultar endpoint: /api/estoque/categoria/list/ 

unidade_medida :

Consultar endpoint: /api/estoque/unidademedida/list/ 

fabricante :

Consultar endpoint: /api/estoque/fabricante/list/ 

ncm :

Consultar endpoint: /api/estoque/ncm/list/ 

Parâmetro  Tipo  Descrição 

codigo  string  Código do Produto 

descricao  string  Descrição do Produto 

codigo_barras  string  Código de Barras do Produto 

tipo_referencia  string  Tipo de Referência 

informar_referencia_saida  string  Permite informar referência na saída do Produto ? 

categorias  string  Categorias 

foto  file  Foto 

valor_custo  decimal  Custo R$ 

valor_venda  decimal  Venda R$ 

unidade_medida  string  Unidade Medida 

detalhes  string  Detalhes 

ativo  string  Ativo? 

fabricante  string  Fabricante AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

codigo 

descricao 

ativo 

codigo_barras 

tipo_referencia 

informar_referencia_saida 

categorias 

foto 

valor_custo 

valor_venda 

unidade_medida 

detalhes 

fabricante 

modelo 

informacoes_adicionais 

ncm 

{{url}}/api/estoque/produto/{produto_id}/update/ 

[Obrigatório] - Código identificador do produto 

[Obrigatório] - Nome do produto 

Produto disponível? Padrão: sim (valores: 0=Inativo;1=Ativo) 

Código de barras do produto 

Tipo de referência (valores: 1 = MAC Address;2 = Serial;3 = Tombamento;) 

Pode informar a referência na saída? 

IDs das categorias (Se informar mais de um, separar por vírgula) 

Foto representadora do produto 

Valor de custo do produto 

Valor de venda do produto 

ID da unidade de medida a ser vinculada 

Detalhes do produto 

ID do fabricante a ser vinculado 

Modelo do produto 

Informações extras do produto 

ID do NCM a ser vinculado 

# POST  Produto - Alterar tipo_referencia :

1 = MAC Address; 

2 = Serial; 

3 = Tombamento. 

ativo :

"0" = Não; 

"1" = Sim. 

Observação :

Se informado tipo de referência, passará a ser obrigatório informar uma referência única na entrada do produto no estoque. Exemplo: API Compras. 

categorias :

Consultar endpoint: /api/estoque/categoria/list/ 

unidade_medida :

Consultar endpoint: /api/estoque/unidademedida/list/ 

fabricante :

Consultar endpoint: /api/estoque/fabricante/list/ 

ncm :

Consultar endpoint: /api/estoque/ncm/list/ 

Parâmetro  Tipo  Descrição 

codigo  string  Código do Produto 

descricao  string  Descrição do Produto 

codigo_barras  string  Código de Barras do Produto 

tipo_referencia  string  Tipo de Referência 

informar_referencia_saida  string  Permite informar referência na saída do Produto ? valores: "0" = Não, "1" = Sim 

categorias  string  Categorias 

foto  file  Foto 

valor_custo  decimal  Custo R$ 

valor_venda  decimal  Venda R$ 

unidade_medida  string  Unidade Medida 

detalhes  string  Detalhes 

ativo  string  Ativo? 

fabricante  string  Fabricante AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

codigo 

descricao 

ativo 

codigo_barras 

tipo_referencia 

informar_referencia_saida 

categorias 

foto 

valor_custo 

valor_venda 

unidade_medida 

detalhes 

fabricante 

modelo 

informacoes_adicionais 

ncm 

{{url}}/api/estoque/compra/create/ 

Substitui o código identificador do produto 

Substitui o nome do produto 

Ativa ou inativa o produto (valores: 0=Inativo;1=Ativo) 

Substitui o código de barras do produto 

Substitui o tipo de referência do produto (valores: 1 = MAC Address;2 = Serial;3 = Tombamento;) 

Ativa ou desativa a possibilidade de informar referência na saída (valores: 0=Inativo;1=Ativo) 

Substitui as categorias do produto (ID) 

Substitui a foto do produto 

Substitui o valor de custo do produto 

Substitui o valor de venda do produto 

Substitui a unidade de medida do produto (ID) 

Substitui os detalhes do produto 

Substitui o fabricante do produto (ID) 

Substitui o modelo do produto 

Substitui as informações adicionais do produto 

Substitui o NCM do produto (ID) 

# POST  Compra - Cadastrar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

Itens: 

Parâmetro  Tipo  Descrição 

fornecedor  integer  Fornecedor 

empresa  integer  Empresa 

nota_fiscal  string  Nota Fiscal 

observacao  string  Observação 

Parâmetro  Tipo  Descrição 

produto_id  integer  Produto 

estoque_id  integer  Local de Estoque 

quantidade  integer  Quantidade 

valor_custo  decimal  Valor Custo (Un) 

desconto  decimal  Desconto 

referencias  array  Referências, formato: ["ref1", "ref2"] 

json 

{

"fornecedor" : 1,

"empresa" : 1,

"notafiscal" : "12345678901234567890123456789012345678901234" ,

"observacao" : "Observação" ,

"itens" :[

{

"produto_id" : 1,

"estoque_id" : 1,

"quantidade" : 2,

"valor" : 120.15 ,

"desconto" : 5.00 ,

"referencias" : ["ref1" , "ref2" ]

}

]{{url}}/api/estoque/transferencia/create/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

}

# POST  Transferência - Cadastrar 

Itens: 

Parâmetro  Tipo  Descrição 

origem  integer  Local de Origem 

destino  integer  Local de Destino 

responsavel_envio  integer  Responsável Envio 

observacao  string  Observação 

Parâmetro  Tipo  Descrição 

produto  integer  Produto 

quantidade  integer  Quantidade 

anotacao  string  Anotação 

referencias  array  Referências transferidas 

json 

{

"origem" : 1,

"destino" : 2,

"responsavel_envio" : 1,

"observacao" : "Observação" ,

"itens" :[

{

"produto" : 1,

"quantidade" : 2,

"anotacao" : "Anotação" ,

"referencias" : ["ref01" , "ref02" ]

}{{url}}/api/ura/produtonfe_produtoestoque/vincular/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

produto_nfe 

produto_estoque 

{{url}}/api/ura/produtonfe_produtoestoque/vincular/ 

]

}

# POST  Vincular Produto NFe X Produto Estoque 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

produto_nfe  integer  Produto NFe 

produto_estoque  integer  Produto Estoque 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do produto vinculado à NFe 

[Obrigatório] - ID do produto existente no estoque que deseja vincular 

# PATCH  Vincular Produto NFe X Produto Estoque Patch AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

produto_nfe 

produto_estoque 

{{url}}/api/ura/compra/nfe/ 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

produto_nfe  integer  Produto NFe 

produto_estoque  integer  Produto Estoque 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do produto vinculado à NFe que deseja alterar 

[Obrigatório] - ID do produto existente no estoque que deseja vincular 

# POST  Compra - NFe 

Itens: 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

nfe  integer  ID da NFe 

estoque  integer  ID do Estoque 

fornecedor  integer  ID do Fornecedor AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

{{url}}/api/estoque/fornecedor/create/ 

Parâmetro  Tipo  Descrição 

produto_id  integer  ID do Produto 

referencias  array  Referências do Produto 

json 

{

"token" : "token" ,

"app" : "app" ,

"nfe" : 1,

"estoque" : 1,

"fornecedor" : 1,

"itens" : [

{

"produto_id" : 1,

"referencias" : ["ref01" ]

}

]

}

# POST  Fornecedor - Cadastrar AUTHORIZATION  Basic Auth 

tipo_pessoa :

"F" = Física; 

"J" = Jurídica. 

sit_fiscal :

"LR" = Lucro Real; 

"LP" = Lucro Presumido; 

"SN" = Simples Nacional; 

"SE" = Simples Nacional, , excesso sublimite de receita bruta. 

contrib_icms :

"1" = 1 - Contribuinte do ICMS; 

"2" = 2 - Contribuinte Isento de IE; 

"9" = 9 - Não Contribuinte. 

ativo :

"0" = Não; 

"1" = Sim. 

Parâmetro  Tipo  Descrição 

tipo_pessoa  string  Tipo de Pessoa do Fornecedor 

sit_fiscal  string  Situação Fiscal do Fornecedor 

nome  string  Nome do Fornecedor 

nome_fantasia  string  Nome Fantasia do Fornecedor 

responsavel_empresa  string  Responsável da Empresa 

nome_contato  string  Nome do Contato do Fornecedor 

cpf_cnpj  string  CPF/CNPJ do Fornecedor 

rg  string  RG do Responsável da Empresa 

rg_emissor  string  Emissor do RG do Responsável da Empresa 

insc_estadual  string  Insc. Estadual do Fornecedor 

insc_municipal  string  Insc. Municipal do Fornecedor 

contrib_icms  string  Contribuinte ICMS do Fornecedor 

endereco logradouro  string  Endereço - Logradouro do Username  {{username}} 

Password  {{password}} 

## Body  formdata 

nome 

tipo_pessoa 

sit_fiscal 

nome_fantasia 

responsavel_empresa 

nome_contato 

cpf_cnpj 

rg 

rg_emissor 

insc_estadual 

insc_municipal 

contrib_icms 

endereco_logradouro 

endereco_numero 

endereco_bairro 

endereco_cidade 

endereco_uf 

endereco_cep 

endereco_complemento 

endereco_ponto_referencia 

endereco_pais 

endereco_coordenadas 

cpais 

cmun 

email 

telefone 

[Obrigatório] - Nome do fornecedor 

Tipo de pessoa do fornecedor (valores: "F"=Física;"J"=Jurídica) 

Situação fiscal do fornecedor (Para valores, verifique a documentação pública) 

Nome fantasia do fornecedor 

Responsável do fornecedor 

Nome do contato do fornecedor 

CPF ou CNPJ do fornecedor 

RG do Fornecedor 

Emissor do RG 

Inscrição estadual do fornecedor 

Inscrição municipal do fornecedor 

Tipo de contribuinte do fornecedor (Para valores, verifique a documentação pública) 

Rua do fornecedor 

Número da rua do fornecedor 

Bairro do fornecedor 

Cidade do fornecedor 

UF do fornecedor 

CEP do fornecedor 

Complemento do endereço do fornecedor 

Ponto de referência do endereço do fornecedor 

País do fornecedor 

Coordenadas (lat/long) do fornecedor 

Código do país (Ex.: Brasil = 1058) 

Código do município (Ex.: 2408102) 

E-mail do fornecedor 

Telefone do fornecedor celular 

fax 

observacao 

json 

ativo 

{{url}}/api/estoque/fornecedor/<fornecedor_id>/update/ 

Celular do fornecedor 

Fax do fornecedor 

Observação para o fornecedor 

JSON para o fornecedor (em caso de integrações futuras) 

Fornecedor disponível? Padrão: sim (valores: 0=Inativo;1=Ativo) 

# POST  Fornecedor - Alterar 

tipo_pessoa :

"F" = Física; 

"J" = Jurídica. 

sit_fiscal :

"LR" = Lucro Real; 

"LP" = Lucro Presumido; 

"SN" = Simples Nacional; 

"SE" Simples Nacional excesso sublimite de receita bruta 

Parâmetro  Tipo  Descrição 

tipo_pessoa  string  Tipo de Pessoa do Fornecedor 

sit_fiscal  string  Situação Fiscal do Fornecedor 

nome  string  Nome do Fornecedor 

nome_fantasia  string  Nome Fantasia do Fornecedor 

responsavel_empresa  string  Responsável da Empresa 

nome_contato  string  Nome do Contato do Fornecedor 

cpf_cnpj  string  CPF/CNPJ do Fornecedor 

rg  string  RG do Responsável da Empresa 

rg_emissor  string  Emissor do RG do Responsável da Empresa 

insc_estadual  string  Insc. Estadual do Fornecedor 

insc_municipal  string  Insc. Municipal do Fornecedor 

contrib_icms  string  Contribuinte ICMS do Fornecedor 

endereco logradouro  string  Endereço - Logradouro do AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

nome 

tipo_pessoa 

sit_fiscal 

nome_fantasia 

responsavel_empresa 

nome_contato 

cpf_cnpj 

rg 

rg_emissor 

insc_estadual 

insc_municipal 

contrib_icms 

endereco_logradouro 

endereco_numero 

endereco_bairro 

endereco_cidade 

endereco_uf 

"SE" = Simples Nacional, , excesso sublimite de receita bruta. 

contrib_icms :

"1" = 1 - Contribuinte do ICMS; 

"2" = 2 - Contribuinte Isento de IE; 

"9" = 9 - Não Contribuinte. 

ativo :

"0" = Não; 

"1" = Sim. 

Novo nome do fornecedor 

Novo tipo de pessoa do fornecedor (valores: "F"=Física;"J"=Jurídica) 

Nova situação fiscal do fornecedor (Para valores, verifique a documentação pública) 

Novo nome fantasia do fornecedor 

Novo responsável do fornecedor 

Novo nome do contato do fornecedor 

Novo CPF ou CNPJ do fornecedor 

Novo RG do Fornecedor 

Novo emissor do RG 

Nova inscrição estadual do fornecedor 

Nova inscrição municipal do fornecedor 

Novo tipo de contribuinte do fornecedor (Para valores, verifique a documentação pública) 

Nova rua do fornecedor 

Novo número da rua do fornecedor 

Novo bairro do fornecedor 

Nova cidade do fornecedor 

Nova UF do fornecedor endereco_cep 

endereco_complemento 

endereco_ponto_referencia 

endereco_pais 

endereco_coordenadas 

cpais 

cmun 

email 

telefone 

celular 

fax 

observacao 

json 

ativo 

{{url}}/api/contrato/termoaceite/{idcontrato}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

token 

app 

Novo CEP do fornecedor 

Novo complemento do endereço do fornecedor 

Novo ponto de referência do endereço do fornecedor 

Novo país do fornecedor 

Novas coordenadas (lat/long) do fornecedor 

Novo código do país (Ex.: Brasil = 1058) 

Novo código do município (Ex.: 2408102) 

Novo e-mail do fornecedor 

Novo telefone do fornecedor 

Novo celular do fornecedor 

Novo fax do fornecedor 

Nova observação para o fornecedor 

Novo JSON para o fornecedor (em caso de integrações futuras) 

Modificar disponibilidade do fornecedor (valores: 0=Inativo;1=Ativo) 

# Termo de Aceite 

# GET  Termo Exibir 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Termo Aceitar {{url}}/api/contrato/termoaceite/{idcontrato} 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

aceite 

{{url}}/api/ura/clientes/ 

# POST  Termo Aceitar 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Necessário enviar para aceitar 

# URA 

# POST  Cliente – Listar Requisição 

status :

"aberto"; 

"pago"; 

"cancelado". 

contrato_status: 

1 = Ativo; 

2 = Inativo; 

3 = Cancelado; 

4 = Suspenso; 

5 = Inviabilidade Técnica; 

6 = Novo; 

7 = Ativo V. Reduzia. 

tipo_servico :

"internet" = Internet; 

"tv" = TV; 

"telefonia" = Telefonia; 

"multimidia" = Multimídia; 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

offset  integer  Offset da Consulta 

limit  integer  Limit da Consulta 

cliente_id  integer  ID do Cliente 

cpfcnpj  string  CPF / CNPJ dos Clientes 

plano  integer  Plano dos Serviços 

login  string  Login do serviço de Internet 

data_vencimento_inicio  string  Data de Vencimento Inicial dos Títulos, formato: "AAAA-MM-DD" 

data_vencimento_fim  string  Data de Vencimento Final dos Títulos, formato: "AAAA-MM-DD" 

data_pagamento_inicio  string  Data de Pagamento Inicial dos Títulos, formato: "AAAA-MM-DD" AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

offset 

limit 

cliente_id 

cpfcnpj 

plano 

login 

contrato 

status 

portador 

telefone 

pop 

contrato_status 

omitir_contratos 

omitir_titulos 

omitir_contatos 

"generico" = Genérico. 

limit: 

Limite padrão = 100, máximo = 500. 

Observações :

Data de Vencimento Inicial obrigatória caso Data de Vencimento Final informada. 

Data de Pagamento Inicial obrigatória caso Data de Pagamento Final informada. 

Data de Status Inicial do Contrato obrigatório caso Data de Status de Contrato Final informado. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 100; Máximo: 500;) 

ID do cliente 

CPF ou CNPJ do cliente 

ID do plano que o cliente deve ter 

Login do serviço de internet 

ID do contrato pertencente ao cliente 

Retorna clientes que tenham títulos nesses status (Para valores, verifique a documentação pública) 

Retorna clientes que tenham títulos desse ID do portador 

Contato telefônico do cliente 

ID do POP que o contrato do cliente deve ter 

Retorna clientes com contratos nessa situação (Para valores, verifique a documentação pública) 

Não imprime dados de contratos 

Não imprime dados de títulos 

Não imprime dados de contatos tipo_servico 

exibir_conexao 

exibir_observacao_cliente 

exibir_observacao_servicos 

data_cadastro_inicio 

data_cadastro_fim 

data_alteracao_inicio 

data_alteracao_fim 

data_vencimento_inicio 

data_vencimento_fim 

data_contrato_status_inicio 

data_contrato_status_fim 

data_pagamento_inicio 

data_pagamento_fim 

assinatura_eletronica 

cto 

cto_porta 

{{url}}/api/ura/listacliente/ 

Retorna clientes que tenham o tipo de serviço especificado nesse parâmetro (Para valores, verifique a documentação pública) 

Retorna se o cliente está conectado (internet) 

Retorna observações do cadastro do cliente 

Retorna observações do contrato do cliente 

Data de cadastro inicial do cliente. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de cadastro final do cliente. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Data de alteração inicial do cadastro do cliente ou endereço. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de alteração final do cadastro do cliente ou endereço. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Data de vencimento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de vencimento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Data de alteração inicial do status de um contrato. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de alteração final do status de um contrato. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Data de pagamento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de pagamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Retorna lista de assinaturas eletrônicas do cliente 

Filtra clientes pelo ID da CTO vinculada ao contrato de serviço 

Filtra clientes pelo número da porta da CTO vinculada ao contrato de serviço 

# POST  Cliente – Listagem Resumida AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

## Requisição 

status: 

1 = Ativo; 

2 = Inativo; 

3 = Cancelado; 

4 = Suspenso; 

5 = Inviabilidade Técnica; 

6 = Novo; 

7 = Ativo V. Reduzia. 

tipo: 

"F" = Pessoa Física; 

"J" = Pessoa Jurídia; 

Observações :

Data de alteração Inicial do status obrigatória caso Data de alteração Final seja informada. 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

pop  integer  ID do POP a ser utilizado na filtragem 

status  integer  Status atual do contrato de serviço 

status_data_inicial  string  Data de alteração inicial do último status de contrato 

status_data_final  string  Data de alteração final do último status de contrato 

tipo  string  Tipo do Cliente 

|token 

app 

pop 

status 

status_data_inicial 

status_data_final 

tipo 

{{url}}/api/ura/consultacliente/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

ID do POP a ser utilizado como filtro 

Status do contrato 

Data de alteração inicial do último status de contrato 

Data de alteração final do último status de contrato 

Tipo de pessoa a ser retornado | Utilizar F ou J 

# POST  Cliente – Consultar 

## Requisição 

tservico :

1 = Internet; 

2 = Tv; 

3 = Multimídia; 

4 = Telefonia; 

5 Genérico 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

cpfcnpj  string  CPF / CNPJ do Cliente* 

contrato  string  ID do Contrato* 

nome  string  Nome do Cliente* 

mac_dhcp  string  MAC_DHCP* 

mac_controle  string  MAC_CONTROLE* 

onu_serial  string  ONU_SERIAL* 

login  string  Login do Serviço* 

senha  string  Senha do Login 

telefone  string  Telefone do Cliente 

radius  string  Radius 

incluir unificados  string  Incluir Contratos Unificados AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

cpfcnpj 

contrato 

nome 

mac_controle 

mac_dhcp 

servico_serial 

onu_serial 

login 

5 = Genérico. 

status :

String separando status por vírgula, exemplo: "1,2,3": 

1 = Ativo; 

2 = Inarivo; 

3 = Cancelado 

4 = Suspenso 

5 = Inviabilidade Técnica; 

6 = Novo; 

7 = Ativo V. Reduzida. 

titulo_status :

abertos 

pagos 

cancelados 

(*) No mínimo um desses filtros é obrigatório. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - CPF ou CNPJ do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - ID do contrato do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Nome do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Mac do serviço de internet do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Mac DHCP do serviço de internet do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Serial controle do serviço de internet do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Phy Address da ONU do serviço de internet do cliente | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Login do serviço do cliente (Utilizar este ou email) | Utilizar um dos filtros obrigatórios email 

senha 

telefone 

radius 

incluir_unificados 

tservico 

status 

atrasado 

servicos_dados 

plano 

titulo_status 

exibir_observacao_cliente 

exibir_observacao_servicos 

pop 

{{url}}/api/ura/contato/add/ 

[Obrigatório] - Email (login) do serviço do cliente (Utilizar este ou login) | Utilizar um dos filtros obrigatórios 

Retorna clientes cujo contrato possuam essa senha (Utilizar em conjunto com login ou email) 

Contato telefônico do cliente 

Retorna situação da sessão radius se aplicável 

Considerará também contratos unificados (Padrão: ignora) 

Busca por tipos de serviço (Para valores, verifique a documentação pública) 

Busca por contratos atualmente nesse status. Pode informar mais de um por vírgula (Para valores, verifique a documentação pública) 

Retorna apenas quem possui títulos em atraso 

Detalha os serviços encontrados (O resultado da consulta pode aumentar consideravelmente) 

Busca por clientes que seus serviços possuam o ID do plano informado nesse parâmetro 

Retorna quem possuir títulos nesse status (valores: 'abertos'; 'pagos'; 'cancelados';) 

Retorna observações do cadastro do cliente 

Retorna observações do contrato do cliente 

Busca por contratos que sejam desse POP (ID) 

# POST  Contato – Criar 

tipo :

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

tipo  string  Tipo do Contato 

contato  string  Contato AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contato 

contrato 

tipo 

{{url}}/api/ura/viabilidade/ 

## AUTHORIZATION  Basic Auth 

TELEFONE_FIXO_RESIDENCIAL 

TELEFONE_FIXO_COMERCIAL 

TELEFONE_RESPONSAVEL 

CELULAR_PESSOAL 

CELULAR_COMERCIAL 

CELULAR_COBRANCA 

CELULAR_RESPONSAVEL 

WHATSAPP 

INSTAGRAM 

TELEFONE_OUTROS 

CELULAR_OUTROS 

VOIP 

EMAIL 

EMAIL_COBRANCA 

SKYPE 

TWITTER 

MSN_MESSENGER 

YAHOO_MESSENGER 

GOOGLE_TALK 

URL_SITE 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Contato a ser cadastrado 

[Obrigatório] - ID do contrato do cliente que terá o contato vinculado 

Tipo do contato, padrão: Celular Pessoal (Para valores, verifique a documentação pública) 

# POST  Viabilidade – Consultar 

Consulta Viabilidade AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

logradouro 

numero_inicial 

numero_final 

bairro 

cep 

cidade 

{{url}}/api/ura/viabilidadeinstalacao 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

gateway 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Consulta por logradouro | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Consulta à partir de um certo número da rua | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Consulta até um certo número da rua | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Consulta por bairro | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Consulta por CEP | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Consulta pela cidade | Utilizar um dos filtros obrigatórios 

# GET  Viabilidade – Consultar via Gateway 

Parâmetro  Tipo  Descrição 

gateway  integer  ID da Gateway de mapas 

raio  integer  Raio de consulta 

coordenada  string  Coordenada do ponto a ser consultado (Modelo "X.XXXXX,Y.YYYYY") 

[Obrigatório] - ID da Gateway de mapas raio 

coordenada 

{{url}}/api/ura/listacontrato/ 

## AUTHORIZATION  B i A th 

[Obrigatório] - Raio de consulta 

[Obrigatório] - Coordenada do ponto a ser consultado (Modelo "X.XXXXX,Y.YYYYY") 

# POST  Contrato – Listar 

## Requisição 

status :

1 = Ativo; 

4 = Suspenso; 

7 = Ativo V. Reduzida. 

tipo :

"F" = Pessoa Física; 

"J" = Pessoa Jurídica; 

"E" = Pessoa Física Estrangeira. 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

status  integer  Status do Contrato 

tipo  string  Tipo de Pessoa 

plano  integer  ID do Plano 

exibir_endereco  boolean  Exibir Endereço do Contrato 

data_cadastro_ini  string  Data de Cadastro Inicial, formato "AAAA-MM-DD" 

data_cadastro_fim  string  Data de Cadastro Final, formato "AAAA-MM-DD" 

data_alteracao_ini  string  Data de Alteração Inicial, formato "AAAA-MM-DD" 

data_alteracao_fim  string  Data de Alteração Final, formato "AAAA MM DD" AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

plano 

tipo 

status 

exibir_endereco 

{{url}}/api/ura/contrato/edit/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

ID do contrato 

ID do plano vinculado ao contrato 

Tipo da pessoa (Para valores, verifique a documentação pública) 

Status atual (ID) do contrato (Para valores, verifique a documentação pública) 

Detalha o endereço do contrato 

# POST  Contrato – Atualizar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

sms_desativado  boolean  Alterar checkbox 'SMS Desativado?' 

forma_cobranca  integer  Alterar Forma de Cobrança 

portador  integer  ID do Portador 

debito_banco  string  Código do banco (3 dígitos) 

debito_agencia  string  Agência da conta (4 dígitos) 

debito_conta  string  Conta do banco 

tag_add  string  IDs de tags a serem adicionadas no contrato 

tag_remove  string  IDs de tags a serem removidas do contrato AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

sms_desativado 

forma_cobranca 

portador 

debito_banco 

debito_agencia 

debito_conta 

tag_add 

tag_remove 

{{url}}/api/contratos/print/{tipo_contrato} 

## Requisição 

forma_cobranca :

1 = Boleto; 

2 = Débito Automático; 

3 = Carnê; 

4 = Cobrança Recorrente; 

5 = Cobrança Recorrente - Recarga Linha Telefônica; 

6 = PIX; 

do contrato 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato 

Altera o campo de SMS Desativado (1=Ativa;0=Inativa;) 

Altera a forma de cobrança do contrato (Para valores, verifique a documentação pública) 

Altera o portador do contrato (informar ID) 

Altera o código do banco para débito automático (3 dígitos) 

Altera a agência para débito automático (4 dígitos) 

Altera a conta para débito automático (Informar conta com dígito, sem traço) 

Adiciona tags ao contrato (Informar IDs, ex.: 1,2,3) 

Remove tags do contrato (Informar IDs, ex.: 1,2,3) 

# GET  Contrato – Imprimir Body  formdata 

token 

app 

contrato 

cpfcnpj 

usuario 

senha 

## Requisição 

{tipo_contrato} :

O parâmetro tipo_contrato na URL da requisição pode ser trocado por um dos valores abaixo: 

contrato 

termoadesao 

contratofidelidade 

cancelamento 

termocomodato 

termoaceite_web 

termoprivacidade 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato (obrigatório para token+app, recomendado para outros) 

cpfcnpj  integer  CPF ou CNPJ do cliente 

usuario  string  Usuário de acesso à central do assinante 

senha  string  Senha de acesso à central do assinante 

[Obrigatório] - Token de autenticação | Utilizar token+app ou cpfcnpj+senha ou usuario+senha 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou cpfcnpj+senha ou usuario+senha 

ID do contrato (Obrigatório para autenticação token+app, e recomendado para as outras) 

CPF ou CNPJ do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha 

Usuário de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha ou usuario+senha 

Senha de acesso à central do cliente | Utilizar token+app ou cpfcnpj+senha {{url}}/api/ura/liberacaopromessa/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

data_promessa 

uracontato 

uraIP 

{{url}}/api/ura/verificaacesso/ 

## AUTHORIZATION  B i A th 

| pp p pj ou usuario+senha 

# POST  Contrato – Liberação por Confiança 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  string  ID do Contrato (obrigatório) 

data_promessa  string  Data de Promessa, formato: "AAAA-MM-DD" 

enviar_sms  string  Enviar SMS avisando sobre a liberação 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato 

Informa uma data de promessa customizada (formato: "AAAA-MM-DD") 

Retorna o valor informado nesse parâmetro na resposta da requisição 

Salva o valor informado nesse parâmetro nas observações da promessa de pagamento 

# POST  Serviço Internet – Verificar disponibilidade AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

telefone 

status_all 

status_filter 

uracontato 

protocolo_ura 

{{url}}/api/ura/portador/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato | Utilizar um dos filtros obrigatórios 

[Obrigatório] - Contato vinculado ao cliente | Utilizar um dos filtros obrigatórios 

Também retorna contratos suspensos (Padrão: apenas ativos e reduzidos) 

Retorna apenas os status especificados (Para valores, verifique a documentação pública) 

Retorna o valor informado nesse parâmetro na resposta da requisição 

Abre uma ocorrência. Caso o serviço esteja em manutenção, a ocorrência será aberta por padrão 

# GET  Portador – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Ob i tó i ] A d t ti ã | Utili t k B i A th app 

{{url}}/api/ura/contrato/status/motivos/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/ura/contrato/status/edit/ 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Motivos de Status – Listar 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Status do Contrato – Atualizar 

## Requisição 

status :

1 = Ativo; 

2 = Inativo; 

3 = Cancelado; 

4 = Suspenso; 

5 = Inviabilidade Técnica; 

6 = Novo; 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

status  integer  Status do Contrato 

motivo  integer  ID do Motivo do Status AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

status 

motivo 

{{url}}/api/ura/cliente/servico/senha/edit/ 

7 = Ativo V. Reduzida. 

motivo : Consultar endpoint "Motivos de Status de Contrato": {{url}}/api/ura/contrato/status/motivos/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato 

[Obrigatório] - ID do novo status (Para valores, verifique a documentação pública) 

ID do novo motivo (Para valores, verifique a documentação pública) 

# POST  Senha do Serviço – Atualizar 

## Requisição 

tipo :

1 = Internet; 

2 = Telefonia; 

3 = Multimidia; 

4 = TV; 

5 Outros 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

servico  integer  ID do Serviço 

tipo  integer  Tipo do Serviço 

senha  string  Senha do Serviço AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

servico 

tipo 

senha 

{{url}}/api/ura/cpemanage/ 

## PARAMS 

token 

app 

contrato 

servico 

{{url}}/api/ura/cpemanage/ 

## Body  formdata 

token 

5 = Outros. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do serviço que será alterado 

[Obrigatório] - ID do tipo de serviço (Para valores, verifique a documentação pública) 

[Obrigatório] - Nova senha do serviço 

# GET  CPE Manage – Consultar 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - ID do contrato de serviço (também responde por 'clientecontrato') 

ID do serviço a ser consultado (Caso o contrato possua múltiplos serviços, informar o id do correto) 

# POST  CPE Manage – Atualizar 

[Obrigatório] - Token de autenticação app 

contrato 

servico 

wifi_status 

novo_ssid 

nova_senha 

wifi_status_5g 

novo_ssid_5g 

nova_senha_5g 

{{url}}/api/ura/consultaplano/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

pop 

## Body  formdata 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - ID do contrato de serviço (também responde por 'clientecontrato') 

ID do serviço a ser consultado (Caso o contrato possua múltiplos serviços, informar o id do correto) 

Alterar situação da Wifi ('on' / 'off') 

Alterar nome da Wifi 

Alterar senha da Wifi 

Alterar situação da Wifi 5GHz ('on' / 'off') 

Alterar nome da Wifi 5GHz 

Alterar senha da Wifi 5GHz 

# GET  Plano – Listar 

Parâmetro (Body)  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

Parâmetro (Query)  Tipo  Descrição 

pop  integer  Retornar apenas planos vinculados à esse POP (ID) 

Retornar apenas planos de um POP (Informar ID) token 

app 

{{url}}/api/model/feriado/ 

## PARAMS 

mes 

ano 

tipo 

pop 

## Body  formdata 

token 

app 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Feriado – Listar 

tipo :

1 = Municipal; 

2 = Estadual; 

3 = Nacional; 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

pop  integer  ID do Pop 

tipo  integer  ID do Tipo 

ano  integer  Ano do Feriado 

mes  integer  Mês do Feriado 

Feriados apenas desse mês (Informar em número) 

Feriados apenas desse ano (Informar em número) 

Tipo do feriado (1=Municipal; 2=Estadual; 3=Nacional;) 

Feriados desse POP (Informar em número) 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação {{url}}/api/ura/classificacoes/list/ 

{{url}}/api/ura/configuracoes/ 

## Body  formdata 

token 

app 

configuracao 

{{url}}/api/ura/notificacaosistema/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

cpfcnpj 

uracontato 

uraagent 

# GET  Classificação - Listar 

# POST  Configurações (Variáveis) – Listar 

Listar Configurações 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

Consulta se há essa variável ativa na base 

# POST  Notificação no Sistema – Criar 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato | Informar este ou cpfcnpj 

[Obrigatório] - CPF ou CNPJ do cliente | Informar este ou contrato 

Retorna o valor informado nesse parâmetro na resposta da requisição 

Retorna o valor informado nesse parâmetro na resposta da requisição {{url}}/api/ura/ocorrencia/list/ 

# POST  Ocorrência – Listar 

## Requisição 

status :

0 = Aberta; 

1 = Encerrada; 

2 = Em execução; 

3 = Pendente. 

contrato_status: 

1 = Ativo; 

2 = Inativo; 

3 = Cancelado; 

4 = Suspenso; 

5 = Inviabilidade Técnica; 

6 = Novo; 

7 = Ativo V. Reduzia. 

pop : Consultar IDs em {{url}}/api/ura/pops/ 

limit :

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

offset  integer  Offset da Consulta 

limit  integer  Limit da Consulta 

ocorrencia  string  Número da Ocorrência 

status  integer  ID do Status da Ocorrência 

contrato  integer  ID do Contrato do Cliente 

contrato_status  integer  ID do Status do Contrato do Cliente 

data_cadastro_inicio  string  Data de Cadastro Inicial da Ocorrência, formato: "AAAA-MM-DD" 

data_cadastro_fim  string  Data de Cadastro Final da Ocorrência, formato: "AAAA-MM-DD" AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

offset 

limit 

ocorrencia 

status 

pop 

tipo 

contrato 

contrato_status 

data_cadastro_inicio 

data_cadastro_fim 

hora_cadastro_inicio 

hora_cadastro_fim 

data_agendamento_inicio 

data agendamento fim 

Limite padrão = 1000, máximo = 1000. 

Observações :

Data de Cadastro Inicial obrigatória caso Data de Cadastro Final informada. 

Data de Agendamento Inicial obrigatória caso Data de Agendamento Final informada. 

Data de Finalização Inicial obrigatória caso Data de Finalização Final informada. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 1000; Máximo: 1000;) 

Filtra pelo número da ocorrência 

Filtra pelo status da ocorrência (Para valores, verifique a documentação pública) 

ID do POP vinculado ao contrato de serviço vinculado à ocorrência 

ID do tipo de ocorrência 

ID do contrato de serviço vinculado à ocorrência 

Status atual do contrato de serviço vinculado à ocorrência (Para valores, verifique a documentação pública) 

Data de cadastro inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de cadastro final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Horário inicial da data de cadastro. Utilizar junto com data de cadastro inicial (formato: HH:MM) 

Horário final da data de cadastro. Utilizar junto com data de cadastro final (formato: HH:MM) 

Data de agendamento inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de agendamento final da ocorrência Utilizar junto com a inicial data_agendamento_fim 

hora_agendamento_inicio 

hora_agendamento_fim 

data_finalizacao_inicio 

data_finalizacao_fim 

hora_finalizacao_inicio 

hora_finalizacao_fim 

{{url}}/api/ura/ordemservico/list/ 

Data de agendamento final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Horário inicial da data de agendamento. Utilizar junto com data de agendamento inicial (formato: HH:MM) 

Horário final da data de agendamento. Utilizar junto com data de agendamento final (formato: HH:MM) 

Data de finalização inicial da ocorrência. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de finalização final da ocorrência. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Horário inicial da data de finalização. Utilizar junto com data de finalização inicial (formato: HH:MM) 

Horário final da data de finalização. Utilizar junto com data de finalização final (formato: HH:MM) 

# POST  Ordem de Serviço – Listar 

## Requisição 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

offset  integer  Offset da Consulta 

limit  integer  Limit da Consulta 

ordem_servico  integer  ID da Ordem de Serviço 

status  integer  ID do Status da Ordem de Serviço 

contrato  integer  ID do Contrato do Cliente 

contrato_status  integer  ID do Status do Contrato do Cliente 

data_cadastro_inicio  string  Data de Cadastro Inicial da Ordem de Serviço, formato: "AAAA-MM-DD" 

data_cadastro_fim  string  Data de Cadastro Final da Ordem de Serviço, formato: "AAAA-MM-AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

offset 

limit 

ordem_servico 

status 

pop 

status :

0 = Aberta; 

1 = Encerrada; 

2 = Em execução; 

3 = Pendente. 

contrato_status: 

1 = Ativo; 

2 = Inativo; 

3 = Cancelado; 

4 = Suspenso; 

5 = Inviabilidade Técnica; 

6 = Novo; 

7 = Ativo V. Reduzia. 

pop : Consultar IDs em {{url}}/api/ura/pops/ 

limit :

Limite padrão = 1000, máximo = 1000. 

Observações :

Data de Cadastro Inicial obrigatória caso Data de Cadastro Final informada. 

Data de Agendamento Inicial obrigatória caso Data de Agendamento Final informada. 

Data de Finalização Inicial obrigatória caso Data de Finalização Final informada. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 1000; Máximo: 1000;) 

Filtra pelo ID da ocorrência 

Filtra pelo status da O.S. (Para valores, verifique a documentação pública) 

ID do POP vinculado ao contrato de serviço vinculado à O.S. motivo 

contrato 

contrato_status 

data_cadastro_inicio 

data_cadastro_fim 

hora_cadastro_inicio 

hora_cadastro_fim 

data_agendamento_inicio 

data_agendamento_fim 

hora_agendamento_inicio 

hora_agendamento_fim 

data_finalizacao_inicio 

data_finalizacao_fim 

hora_finalizacao_inicio 

hora_finalizacao_fim 

{{url}}/api/ura/ocorrencia/metodo/list/ 

ID do motivo da O.S. 

ID do contrato de serviço vinculado à O.S. 

Status atual do contrato de serviço vinculado à O.S. (Para valores, verifique a documentação pública) 

Data de cadastro inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de cadastro final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Horário inicial da data de cadastro. Utilizar junto com data de cadastro inicial (formato: HH:MM) 

Horário final da data de cadastro. Utilizar junto com data de cadastro final (formato: HH:MM) 

Data de agendamento inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de agendamento final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Horário inicial da data de agendamento. Utilizar junto com data de agendamento inicial (formato: HH:MM) 

Horário final da data de agendamento. Utilizar junto com data de agendamento final (formato: HH:MM) 

Data de finalização inicial da O.S.. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de finalização final da O.S.. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Horário inicial da data de finalização. Utilizar junto com data de finalização inicial (formato: HH:MM) 

Horário final da data de finalização. Utilizar junto com data de finalização final (formato: HH:MM) 

# GET  Método de Ocorrência – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## HEADERS 

Content-Type  application/json 

## Body  formdata 

token 

app 

{{url}}/api/ura/tecnicos/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Técnico – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Chamado – Criar {{url}}/api/ura/chamado/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

## Requisição 

metodo : Consultar códigos em {{url}}/api/ura/ocorrencia/metodo/list/ 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato (obrigatório) 

conteudo  string  Conteúdo da ocorrência e ordem de serviço 

conteudolimpo  integer  Remove a mensagem padrão de abertura vira URA 

observacao  string  Conteúdo do campo de observações 

ocorrenciatipo  integer  Código do Tipo de Ocorrência, Padrão 5 

tipoclassificacoes  array  IDs das classificações a serem vinculadas na ocorrência. Ex.: [10, 15] 

metodo  integer  Código do Método da ocorrência 

t i t  ID d S t 

json 

{

"token" : "{{token}}" ,

"app" : "{{app}}" ,

"contrato" : 308 ,

"ocorrenciatipo" : 30 ,

"tipoclassificacoes" : [5]

}{{url}}/api/ura/audio/add/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

protocolo 

url 

{{url}}/api/ura/pops/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

}

# POST  Chamado – Anexar Áudio 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Número da ocorrência que terá o áudio vinculado 

[Obrigatório] - Endereço (URL) do áudio que será vinculado 

# POST  POP – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth {{url}}/api/ura/empresas/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

cnpj 

{{url}}/api/ura/fornecedores/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

# POST  Empresa – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

cnpj  string  CNPJ da Empresa 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

CNPJ da empresa 

# POST  Fornecedor – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

cpfcnpj  string  CPF / CNPJ do Fornecedor Use a e {{use a e}} 

Password  {{password}} 

## Body  formdata 

token 

app 

cpfcnpj 

{{url}}/api/ura/contas/tiposdocumentos/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/ura/contas/{tipo}/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

CPF ou CNPJ do fornecedor 

# POST  Tipo de Documento (Conta) – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Conta à Pagar/Receber – Listar Requisição 

tipo :

pagar 

receber 

status :

1 = Pendente; 

2 = Quitado; 

3 = Cancelado; 

4 = Atrasada. 

tipo_documento : Consultar IDs em {{url}}/api/ura/contas/tiposdocumentos/ 

plano_contas : Consultar IDs em {{url}}/api/ura/planoscontas/ 

empresa : Consultar IDs em {{url}}/api/ura/empresas/ 

pop : Consultar IDs em {{url}}/api/ura/pops/ 

fornecedor : Consultar IDs em {{url}}/api/ura/fornecedores/ 

limit :

Limite padrão = 100, máximo = 500. 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

offset  integer  Offset da Consulta 

limit  integer  Limit da Consulta 

descricao  string  Descrição da Conta 

nota_fiscal  string  Nota Fiscal da Conta 

status  integer  ID do Status da Conta 

tipo_documento  integer  ID do Tipo de Documento da Conta 

plano_contas  integer  ID do Plano de Conta da Conta 

empresa  integer  ID da Empresa da Conta 

pop  integer  ID do POP da Conta 

fornecedor  integer  ID do Fornecedor da Conta AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

offset 

limit 

descricao 

nota_fiscal 

status 

tipo_documento 

plano_contas 

empresa 

pop 

fornecedor 

usuario 

data_cadastro_inicio 

data_cadastro_fim 

data_vencimento_inicio 

data_vencimento_fim 

data_pagamento_inicio 

Observações :

Data de Cadastro Inicial obrigatória caso Data de Cadastro Final informada. 

Data de Vencimento Inicial obrigatória caso Data de Vencimento Final informada. 

Data de Pagamento Inicial obrigatória caso Data de Pagamento Final informada. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 100; Máximo: 500;) 

Descrição da conta à pagar ou receber 

Número da nota fiscal vinculada a conta à pagar ou receber 

Status da conta à pagar ou receber (Para valores, verifique a documentação pública) 

"Tipo Documento" selecionado na conta à pagar ou receber 

ID do plano de contas vinculado a conta à pagar ou receber 

ID da empresa vinculado a conta à pagar ou receber 

ID do POP vincualdo a conta à pagar ou receber 

ID do fornecedor vincualdo a conta à pagar ou receber 

Nome do usuário que cadastrou a conta à pagar ou receber 

Data de cadastro inicial da conta à pagar ou receber (formato: "AAAA-MM-DD") 

Data de cadastro final da conta à pagar ou receber (formato: "AAAA-MM-DD") 

Data de vencimento inicial da conta à pagar ou receber (formato: "AAAA-MM-DD") 

Data de vencimento final da conta à pagar ou receber (formato: "AAAA-MM-DD") 

Data de pagamento inicial da conta à pagar ou receber (formato: "AAAA-_p g _

data_pagamento_fim 

{{url}}/api/ura/planoscontas/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/ura/pontosrecebimentos/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

p g p g (MM-DD") 

Data de pagamento final da conta à pagar ou receber (formato: "AAAA-MM-DD") 

# POST  Plano de Contas – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Ponto de Recebimento – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/ura/titulos/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Fatura – Listar 

## Requisição 

limit: 

Limite padrão = 1000. 

tipo_pessoa :

"F" → Pessoa Física 

"J" → Pessoa Jurídica 

"E" → Pessoa Física Estrangeira 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

offset  integer  Offset da Consulta 

limit  integer  Limit da Consulta 

cliente_id  integer  ID do Cliente 

cpfcnpj  string  CPF / CNPJ dos Clientes 

contrato  integer  ID do Contrato 

empresa_cnpj  string  CNPJ da empresa emissora dos títulos 

tipo_pessoa  string  Tipo de pessoa vinculada aos títulos 

data_vencimento_inicio  string  Data de Vencimento inicial dos títulos, formato: "AAAA-MM-DD" 

data_vencimento_fim  string  Data de Vencimento final dos títulos formato: "AAAA MM DD" AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

offset 

limit 

cliente_id 

cpfcnpj 

contrato 

status 

portador 

ordenar 

"EJ" → Pessoa Jurídica Estrangeira 

status :

"abertos"; 

"pagos"; 

"cancelados". 

ordenar :

"data_documento" 

"data_vencimento" 

"data_pagamento" 

ordenar_ordem :

asc 

desc 

Observações :

Data de Vencimento Inicial obrigatória caso Data de Vencimento Final informada. 

Data de Pagamento Inicial obrigatória caso Data de Pagamento Final informada. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 250; Máximo: 250;) 

ID do cliente vinculado aos títulos 

CPF ou CNPJ do cliente vinculado aos títulos 

ID do contrato de serviço vinculado aos títulos 

Filtrar determinados status de títulos (escolhas: 'abertos'; 'pagos'; 'cancelados';) 

ID do portador gerador dos títulos 

Ordena os títulos em 3 modos (escolhas: 'data_documento'; 'data_vencimento'; 'data_pagamento';) ordenar_ordem 

empresa_cnpj 

tipo_pessoa 

data_vencimento_inicio 

data_vencimento_fim 

data_pagamento_inicio 

data_pagamento_fim 

data_cancelamento_inicio 

data_cancelamento_fim 

data_acordo_inicio 

data_acordo_fim 

{{url}}/api/ura/fatura2via/ 

Ordenar de forma crescente ou decrescente (escolhas: 'asc'; 'desc';) 

CNPJ da empresa vinculada aos títulos. 

Tipo de pessoa vinculada aos títulos. As escolhas são F (Física), J (Jurídica), E (Estrangeira Física) e EJ (Estrangeira Jurídica). 

Data de vencimento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de vencimento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Data de pagamento inicial dos títulos. Utilizar junto com a final (formato: "AAAA-MM-DD") 

Data de pagamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Data de cancelamento inicial dos títulos. Se utilizado sozinho, filtrará títulos cancelados especificamente nesse dia (formato: "AAAA-MM-DD") 

Data de cancelamento final dos títulos. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

Títulos de acordo de pagamento gerados à partir dessa data. Se utilizado sozinho, filtrará títulos de acordo gerados especificamente nesse dia (formato: "AAAA-MM-DD") 

Títulos de acordo de pagamento gerados até essa data. Utilizar junto com a inicial (formato: "AAAA-MM-DD") 

# POST  Fatura – Segunda via 

tipo_ordenacao :

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

tipo_ordenacao  string  Tipo da Ordenação, padrão: "data_documento" 

modo_ordenacao  string  Modo da Ordenação, padrão: "desc" 

nao_gerar_os  integer  Não Gerar OS AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

cpfcnpj 

contrato 

telefone 

notafiscal 

faturas_abertas_todas 

numero_documento 

ocorrencia_conteudo 

nao_gerar_os 

tipo_ordenacao 

modo_ordenacao 

link_pdf 

{{url}}/api/ura/pagamento/pix/{fatura} 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

"data_documento"; 

"data_vencimento". 

modo_ordenacao :

"asc"; 

"desc". 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - CPF ou CNPJ do cliente | Informar este ou contrato 

[Obrigatório] - ID do contrato do cliente | Informar este ou cpfcnpj 

Se informado, tentará inferir o cpfcnpj à partir do número de telefone 

Trará também nota fiscal, se existir 

Retorna todos os títulos válidos 

Filtra especificamente um número de documento 

A ocorrência aberta terá o conteúdo informado nesse parâmetro 

Não gera chamado para essa solicitação 

Ordena os títulos em 2 modos (escolhas: 'data_documento'; 'data_vencimento';) 

Ordenar de forma crescente ou decrescente (escolhas: 'asc'; 'desc';) 

Caso exista um link de título, o mesmo ficará com ".pdf" no final do link 

# POST  Fatura – Gerar PIX Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

{{url}}/api/ura/enviafatura/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

tipo 

email 

celular 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato vinculado ao título que será gerado/retornado o PIX 

# POST  Fatura – Enviar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

mensagem  string  Mensagem customizada do envio 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato 

Método do disparo, aceita "email" ou "sms" (sms também é tratado como whatsapp). Padrão: "email" 

Solicita, caso o tipo seja "email", o disparo para esse email informado ao invés do email do contrato 

Solicita, caso o tipo seja "sms", o disparo para esse celular informado ao numero_documento 

mensagem 

conteudo 

link_pdf 

{{url}}/api/banco/titulo/{fatura_id}/baixar/ 

invés do celular do contrato 

Dispara, especificamente, o título com o número de documento especificado nesse parâmetro 

Especifica a mensagem disparada 

Informa o conteúdo da ocorrência de envio que será aberta. Padrão: 'Envio de Fatura via URA' 

Caso exista um link de título, o mesmo ficará com ".pdf" no final do link 

# POST  Fatura – Liquidar 

## Requisição 

fatura_id:  ID da Fatura 

forma_pagamento: 

"DEBITO" 

"CARTAO" 

"DINHEIRO" 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

data_pagamento  string  Data de Pagamento, formato: "AAAA-MM-DD" (obrigatório) 

valor_pago  float  Valor Pago, precisa ser maior que 0 (obrigatório) 

forma_pagamento  string  Forma de Pagamento 

ponto_recebimento  integer  ID do Ponto de Recebimento 

tarifas  float  Valor das Tarifas, precisa ser maior que 0 

liquidacao_parcial  integer  Define se a liquidação será parcial. Valor 1 

desconto  float  Define o desconto de uma liquidação parcial, caso exista 

motivodesconto  string  Define o motivo do desconto, i t Body  formdata 

token 

app 

data_pagamento 

valor_pago 

ponto_recebimento 

forma_pagamento 

tarifas 

liquidacao_parcial  1

desconto 

motivodesconto 

observacao 

"PIX" 

ponto_recebimento: 

Ponto de Recebimento que será utilizado no lançamento do caixa; 

Consultar IDs em {{url}}/api/ura/pontosrecebimentos/ 

Caso não seja informado, será utilizado o definido no SGP (Gateway, Portador). 

## Resposta 

status_code: 

403: Falha na autenticação, Token precisa estar válido, ativo e opção "Permite Baixar Titulo" marcada no SGP; 

404: Fatura com status atual de "Gerado" não encontrada para a {{fatura_id}} informada; 

401: 

"data_pagamento" e "valor_pago" obrigatórios; 

Se "forma_pagamento" informada ela tem que ser uma das seguintes formas: "DEBITO", "CARTAO", "DINHEIRO", "PIX"; 

"valor_pago" tem que ser maior que 0; 

Se "tarifas" informadas tem que ser maior que 0. 

202: Fatura baixada. 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - Data de pagamento do título (formato: 'AAAA-MM-DD') 

[Obrigatório] - Valor pago do título (ex: '51.52') 

ID do caixa de liquidação. Se não informado, procurará o caixa vinculado ao portador do boleto 

Forma de pagamento. Padrão: 'Dinheiro' (valores: 'DINHEIRO', 'CARTAO', 'DEBITO', 'PIX') 

Tarifa do título (ex: '0.15') 

Informa se será uma liquidação parcial. Valor: 1 

Define um desconto para a liquidação parcial 

Descreve o motivo do desconto, caso exista 

Observação extra para que seja salva no título 

# POST  F E{{url}}/api/banco/titulo/{fatura_id}/estornar/ 

## Body  raw  (json) 

{{url}}/api/banco/titulo/{fatura_id}/pagamento/list 

# POST  Fatura – Estornar 

## Requisição 

fatura_id:  ID da Fatura 

ponto_recebimento: 

Ponto de Recebimento que será utilizado no lançamento de estorno no caixa; 

Consultar IDs dos pontos de recebimento em {{url}}/api/ura/pontosrecebimentos/ 

Consultar IDs dos lançamentos de caixa em {{url}}/api/banco/titulo/{fatura_id}/pagamento/list 

Para permitir estornar, é necessário que o portador tenha a checkbox "Permite Estornar Título via API" marcada. 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

pontoRecebimento  integer  ID do Ponto de Recebimento (obrigatório) 

estorno_parcial  integer  Informa se será um estorno de uma liquidação parcial. Valor: 1 

caixalancamento_id  integer  Informa o ID do caixa que será utilizado no estorno 

json 

{

"token" : "{{token}}" ,

"app" : "{{app}}" ,

"pontoRecebimento" : 1,

"caixalancamento_id" : 2,

"estorno_parcial" : 1

}

# POST  Fatura – Listar lançamentos de caixa Body  formdata 

token  {{token}} 

app  {{app}} 

{{url}}/api/banco/titulo/{fatura_id}/cancelar/ 

## Body  formdata 

token 

app 

motivo 

naolibera 

## Requisição 

fatura_id:  ID da Fatura 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

# POST  Fatura – Cancelar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

motivo  string  Motivo (obrigatório) 

naolibera  integer  Não Libera, se informado 

cancelar_nf  integer  Cancelar NF, se informado 

taxa_baixa_lanc  integer  Taxa Baixa, se informado 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - Descreva o motivo do cancelamento 

Não realiza liberação dos serviços mediante cancelamento cancelar_nf 

taxa_baixa_lanc 

{{url}}/api/banco/titulo/{fatura_id}/descancelar/ 

## Body  formdata 

token 

app 

{{url}}/api/ura/cliente/mensalidade/avulsa/add/ 

Se existirem notas fiscais para o título, as cancela também 

Solicita o lançamento da taxa de cancelamento. A taxa deve estar configurada no portador 

# POST  Fatura – Descancelar 

## Requisição 

fatura_id:  ID da Fatura 

Para permitir descancelar, é necessário que o portador tenha a checkbox "Permite Descancelar Título via API" marcada. 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

# POST  Fatura – Gerar Mensalidade AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

contrato 

ano 

mes 

ignorar_titulos_cancelados 

gerar_proporcional 

gerar_pix 

{{url}}/api/ura/cliente/titulo/avulso/add/ 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  integer  ID do Contrato 

ano  integer  Ano 

mes  integer  Mês 

ignorar_titulos_cancelados  boolean  Ignorar Títulos Cancelados 

gerar_proporcional  boolean  Gerar Proporcional 

gerar_pix  boolean  Gerar Pix 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato que terá a mensalidade gerada 

[Obrigatório] - Ano de validade da mensalidade 

[Obrigatório] - Mês de validade da mensalidade 

Ignora títulos cancelados na tentativa de geração 

Tenta uma geração proporcional (funcional para o primeiro título do contrato) 

Solicita a geração do PIX junto com a criação da mensalidade 

# POST  Fatura - Gerar Título {{url}}/api/ura/acordopagamento 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

contrato  int  ID do Contrato (obrigatório) 

portador  int  ID do Portador (obrigatório) 

parcelas  int  Número de Parcelas (obrigatório) 

valor  decimal  Valor (obrigatório) 

data_vencimento  string  Data de Vencimento, formato "AAAA-MM-DD" (obrigatório) 

desconto_vencimento  decimal  Valor do Desconto Vencimento 

observacao  string  Observação 

plano_contas  int  ID do Plano de Contas (obrigatório) 

demonstrativo  string  Demonstrativo 

# POST  Fatura – Gerar Acordo de Pagamento Caso o acordo tenha uma entrada, os parâmetros de nome  entrada_valor  e entrada_centrodecusto  devem ser 

Parâmetros obrigatórios  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório token+app ou username+password) 

app  string  Nome da Aplicação no SGP (obrigatório token+app ou username+password) 

cliente  integer  ID do Cliente que terá o acordo gerado 

titulos  array  IDs dos títulos englobados pelo acordo 

contrato  integer  ID do Contrato que terá o acordo gerado 

centrodecusto  integer  ID do Plano de Contas desse acordo 

portador  integer  ID do Portador que originará o acordo 

parcelas  integer  Quantidade de parcelas do acordo 

Parâmetros opcionais  Tipo  Descrição  Exemplo de Valor 

liberar_servico  string  Informar se a criação do acordo deve liberar o serviço 

"True" 

cancelar_contrato_auto matico 

string  Define a checkbox de cancelar contrato automático no acordo 

"True" 

cancelar_titulos_autom atico 

string  Define a checkbox de cancelar títulos automaticamente no acordo 

"True" 

entrada_valor  float  Define o valor de entrada do acordo, caso exista 

50.00 

entrada_centrodecusto  integer  Define, pelo ID, qual o plano de contas dessa entrada 

9

entrada_pontorecebim ento 

integer  Define, pelo ID, em qual caixa será lançado o valor de entrada 

1AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

{{url}}/api/ura/nfe/list/ 

utilizados com: 

 entrada_pontorecebimento 

 entrada_formapagamento 

 entrada_data_baixa 

OU 

 gerar_titulo_entrada 

 entrada_portador 

json 

{

"token" : "{{token}}" ,

"app" : "{{app}}" ,

"cliente" : 1,

"titulos" : [1,2],

"contrato" : 1,

"centrodecusto" : 9,

"portador" : 1,

"parcelas" : 2,

"valor" : 258.25 ,

"data_vencimento" : "2025-01-31" ,

"desconto_venc" : 5.00 ,

"tolerancia_dias" : 2

}

# POST  NFe - Listar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

chave 

data_emissao_inicio 

data_emissao_fim 

{{url}}/api/ura/nfe/importar/ 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

chave  string  Chave 

data_emissao_inicio  string  Data de Emissão Início, formato: "AAAA-MM-DD" 

data_emissao_fim  string  Data de Emissão Fim, formato: "AAAA-MM-DD" 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Chave de acesso da noa fiscal eletrônica (44 dígitos) 

Data de emissão inicial da nota fiscal. Se informada, informar também a final. (formato: 'AAAA-MM-DD') 

Data de emissão final da nota fiscal. Se informada, informar também a inicial. (formato: 'AAAA-MM-DD') 

# POST  NFe - Importar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

xml  file  Arquivo XML AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

xml 

{{url}}/api/ura/nas/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

xml  file  Arquivo XML 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Arquivo XML da nota fiscal eletrônica 

# POST  NAS - Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

json 

{

"app" : {{app }},

"token" : {{token }}

}{{url}}/api/sms/gateway/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/sms/send/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/ura/manutencao/list/ 

# GET  SMS - Gateways 

# GET  SMS - Enviar 

Parâmetro  Tipo  Descrição 

phone  string  Telefones, separados por vírgula (obrigatório) 

msg  string  Mensagem (obrigatório) 

gateway  int  ID da Gateway (obrigatório) 

idcliente  int  ID do Cliente, funcionalidade a depender da Gateway 

idcontrato  int  ID do Contrato, funcionalidade a depender da Gateway 

link_url  string  URL da fatura/pix/anexo, funcionalidade a depender da Gateway 

# GET  Manutenção - Listar 

# POST  Manutenção - Cadastrar {{url}}/api/ura/manutencao/add/ 

enviar_sms :

0 = False; 

1 = True. 

ativa :

0 = False; 

1 = True. 

severidade :

0 = Desconhecido; 

1 = Operacional; 

2 = Problemas de performance; 

3 = Indisponibilidade parcial; 

4 = Indisponibilidade total. 

status :

0 = Desconhecido; 

1 = Investigando; 

2 = Identificado; 

3 = Observando; 

4 = Resolvido. 

pops :

Listar os Pops no endpoint: {{url}}/api/ura/pops/ 

nas :

Listar os NAS no endpoint: {{url}}/api/ura/nas/list/ 

Parâmetro  Tipo  Descrição 

descricao  string  Descrição da Manutenção (Obrigatório) 

data_inicial  string  Data Inicial da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" (Obrigatório) 

data_final  string  Data Final da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" (Obrigatório) 

severidade  int  Severidade da Manutenção (Obrigatório) 

status  int  Status da Manutenção (Obrigatório) 

observacoes  string  Observações da Manutenção 

mensagem_central  string  Mensagem da Central 

mensagem_ura  string  Mensagem da URA 

enviar_sms  int  Enviar SMS? 

ativa  int  Ativa? {{url}}/api/ura/manutencao/edit/ 

aps :

Listar os APs no endpoint: {{url}}/api/ura/ap/list/ 

sources :

Listar os Sources no endpoint: {{url}}/api/ura/fonte/list/ 

switches :

Listar os Switches no endpoint: {{url}}/api/ura/switch/list/ 

olts :

Listar as OLTs no endpoint: {{url}}/api/fttx/olt/list/ 

oltpons :

Listar as PONs no endpoint: {{url}}/api/fttx/olt/{olt_id}/pon/list/ 

ctos :

Listar as CTOs no endpoint: {{url}}/api/fttx/splitter/all/ 

# POST  Manutenção - Alterar 

enviar_sms :

0 = False; 

1 = True. 

ativa :

Parâmetro  Tipo  Descrição 

manutencao  int  ID da Manutenção 

descricao  string  Descrição da Manutenção 

data_inicial  string  Data Inicial da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" 

data_final  string  Data Final da Manutenção, formato: "AAAA-MM-DD HH:MM:SS" 

observacoes  string  Observações da Manutenção 

mensagem_central  string  Mensagem da Central 

mensagem_ura  string  Mensagem da URA 

enviar_sms  int  Enviar SMS? 

ativa  int  Ativa? 

severidade  int  Severidade da Manutenção 

status  int  Status da Manutenção {{url}}/api/ura/manutencao/delete/ 

ativa :

0 = False; 

1 = True. 

severidade :

0 = Desconhecido; 

1 = Operacional; 

2 = Problemas de performance; 

3 = Indisponibilidade parcial; 

4 = Indisponibilidade total. 

status :

0 = Desconhecido; 

1 = Investigando; 

2 = Identificado; 

3 = Observando; 

4 = Resolvido. 

pops :

Listar os Pops no endpoint: {{url}}/api/ura/pops/ 

nas :

Listar os NAS no endpoint: {{url}}/api/ura/nas/list/ 

aps :

Listar os APs no endpoint: {{url}}/api/ura/ap/list/ 

sources :

Listar os Sources no endpoint: {{url}}/api/ura/fonte/list/ 

switches :

Listar os Switches no endpoint: {{url}}/api/ura/switch/list/ 

olts :

Listar as OLTs no endpoint: {{url}}/api/fttx/olt/list/ 

oltpons :

Listar as PONs no endpoint: {{url}}/api/fttx/olt/{olt_id}/pon/list/ 

ctos :

Listar as CTOs no endpoint: {{url}}/api/fttx/splitter/all/ 

# POST  Manutenção - Deletar 

Parâmetro  Tipo  Descrição 

manutencao  int  ID da Manutenção 

# GET  AP - Listar {{url}}/api/ura/ap/list/ 

{{url}}/api/ura/fonte/list/ 

{{url}}/api/ura/switch/list/ 

{{url}}/api/ura/documento/consulta/gateway/{id_gateway}/?documento=&uf=&adicionais= 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

documento 

uf 

adicionais 

# GET  Fonte - Listar 

# GET  Switch - Listar 

# GET  Proteção de Crédito - Consulta Documento 

Documento da pessoa (F/J) 

UF da Pessoa 

Código do adicional (pode ser separado por virgula caso necessidade de informar 2 ou mais adicionais) {{url}}/api/ura/consulta/adicionais/gateway/{id_gateway}/?tipo_pessoa 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

tipo_pessoa 

{{url}}/api/ura/gatewaysserasa/list 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

# GET  Proteção de Crédito - Adicionais 

F/J 

# GET  Proteção de Crédito - Listar Gateways 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Anotações - Adicionar {{url}}/api/ura/cliente/anotacao/add 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

cliente_id 

anotacao 

contrato_id 

tipo_id 

## Requisição 

alerta_modo: 

1 → Pop-up Cadastro,Contrato,Financeiro,Ocorrências 

2 → Pop-up Cadastro,Contrato 

3 → Pop-up Cadastro,Financeiro 

7 → Pop-up Cadastro,Ocorrências 

4 → Pop-up Cadastro 

5 → Pop-up Contrato 

6 → Pop-up Financeiro 

8 → Pop-up Ocorrência 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

cliente_id  integer  ID do Cliente (obrigatório) 

anotacao  string  Conteúdo da anotação (obrigatório) 

contrato_id  integer  ID do Contrato de Serviço 

tipo_id  integer  ID do tipo de anotação 

alerta_modo  integer  ID do modo de alerta 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatorio] - ID do cliente para o qual será adicionado a nova Anotação 

[Obrigatório] - Conteúdo da Anotação 

[Opcional] - ID do contrato para o qual será vinculado a nova anotação 

[Opcional] - ID do Tipo de Anotação alerta_modo 

{{url}}/api/ura/cliente/anotacao/list 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

id 

cliente_id 

contrato_id 

{{url}}/api/ura/cliente/anotacao/{id}/edit 

[Opcional] - Modo de alerta. Consulte documentação para valores possíveis 

# GET  Anotações - Listar/Consultar 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

id  integer  ID da anotação 

cliente_id  integer  ID do cliente 

contrato_id  integer  ID do Contrato de Serviço 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Opcional] - Consultar anotação filtrando pelo ID 

[Opcional] - Consultar anotações filtrando pelo ID do cliente 

[Opcional] - Consultar anotações filtrando pelo ID do contrato de serviço 

# POST  Anotações - Atualizar AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

anotacao 

tipo_id 

alerta_modo 

## Requisição 

alerta_modo: 

1 → Pop-up Cadastro,Contrato,Financeiro,Ocorrências 

2 → Pop-up Cadastro,Contrato 

3 → Pop-up Cadastro,Financeiro 

7 → Pop-up Cadastro,Ocorrências 

4 → Pop-up Cadastro 

5 → Pop-up Contrato 

6 → Pop-up Financeiro 

8 → Pop-up Ocorrência 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

anotacao  string  Novo conteúdo da anotação 

tipo_id  integer  ID do novo tipo de anotação 

alerta_modo  integer  ID do novo modo de alerta 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Opcional] - Novo conteúdo da anotação 

[Opcional] - ID do novo tipo de anotação 

[Opcional] - ID do novo modo de alerta 

# POST  Anotação - Remover {{url}}/api/ura/cliente/anotacao/{id}/remove/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/ura/listgatewaymapa 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Mapa FTTH - Listar Gateways 

Parâmetro  Tipo  Descrição 

token  string  Token da Aplicação no SGP (obrigatório) 

app  string  Nome da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth {{url}}/api/precadastro/plano/list 

## Body  formdata 

token 

app 

{{url}}/api/precadastro/vencimento/list 

## Body  formdata 

token 

app 

# Pré-Cadastro 

# POST  Plano – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

# POST  Vencimento – Listar 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

# POST  Vendedor – Listar {{url}}/api/precadastro/vendedor/list 

## Body  formdata 

token 

app 

{{url}}/api/precadastro/F 

# POST  Vendedor Listar 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

# POST  Pré-Cadastro – Cadastrar PF 

sexo :

"M" = Masculino; 

"F" = Feminino. 

estadocivil :

"S" = Solteiro(a); 

"C" = Casado(a); 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

nome  string  Nome do Cliente 

cpfcnpj  string  CPF do Cliente 

rg  string  RG do Cliente 

rg_emissor  string  Emissor do RG do Cliente 

email  string  Email do Cliente 

celular  string  Celular do Cliente 

datanasc  string  Data de Nascimento do Cliente, formato: "AAAA-MM-DD" 

logradouro  string  Logradouro do Endereço do Cliente 

numero  integer  Número do Endereço do Cliente 

complemento  string  Complemento do Endereço do Body  formdata 

token 

app 

nome 

logradouro 

numero 

bairro 

cidade 

uf 

cep 

complemento 

pontoreferencia 

condominio 

map_ll 

pais 

C = Casado(a); 

"D" = Divorciado(a); 

"V" = Viúvo(a). 

modoaquisicao :

0 = Próprio; 

1 = Comodato. 

comissao_tipo :

1 = %; 

2 = Valor Fixo. 

instalacao_entrada_forma :

1 = Gerar Título na Ativação; 

2 = Gerar Título no Cadastro (antes da ativação) - Definir Instalação Entrada. 

instalacao_parcela_forma :

1 = Gerar Parcelas de Instalação - Vencimento do Cliente; 

2 = Incluir Parcelas nas próximas faturas; 

3 = Gerar Parcelas de Instalação - DDL(30,60,90); 

4 = Gerar Parcela de Instalação - Vencimento dia de ativação ou cadastro. 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - Nome do cliente 

[Obrigatório] - Logradouro do cliente 

Número da rua 

Bairro do endereço 

Cidade do endereço 

UF do endereço, apenas sigla 

CEP do endereço 

Complemento do endereço 

Ponto de referência do endereço 

ID do condomínio desse endereço 

Latitude e longitude do endereço (ex: '-11.1313962,-33.1017715') 

País do endereço, apenas sigla (padrão: BR) datanasc 

cpfcnpj 

rg 

rg_emissor 

nomepai 

nomemae 

nacionalidade 

naturalidade 

estadocivil 

sexo 

profissao 

observacao 

email 

celular 

portador_id 

pop_id 

nas_id 

plano_id 

planointernet_id 

planobase_id 

vencimento_id 

login 

senha 

central_senha 

modoaquisicao 

fidelidade_id 

contrato_id 

ip 

mac 

Data de nascimento (formato: 'AAAA-MM-DD') 

CPF do cliente 

RG do cliente 

Emissor do RG 

Nome do pai 

Nome da mãe 

Nacionalidade 

Naturalidade 

Estado civil (escolhas: 'S' = Solteiro(a); 'C' = Casado(a); 'D' = Divorciado(a); 'V' = Viúvo(a);) 

Gênero (escolhas: 'M' = Masculino; 'F' = Feminino;) 

Profissão do cliente 

Observação do cliente 

E-mail de contato 

Telefone de contato 

ID do portador - [Para criação de contrato] 

ID do POP - [Para criação de contrato] 

ID do NAS 

ID do Plano (Internet) 

ID do Plano de Internet 

ID do Plano Base (Internet, TV, Telefonia, Multimídia, Genérico) 

ID do vencimento - [Para criação de contrato] 

Login (PPPoE ou Email) do contrato - [Para criação de contrato] 

Senha do contrato - [Para criação de contrato] 

Senha de acesso à cental - [Para criação de contrato] 

Situação do equipamento (escolhas: 0 = 'Próprio'; 1 = 'Comodato';) - [Para criação de contrato] 

ID da fidelidade - [Para criação de contrato] 

ID do grupo de contratos de impressão - [Para criação de contrato] 

Endereço de IP - [Para criação de contrato] 

MAC Controle - [Para criação de contrato] splitter_id 

splitter_port 

servicodesc 

tipo_equipamento_id 

midia_id 

vendedor_id 

tecnico_id 

os_instalacao 

instalacao_quantidade_parcelas 

instalacao_preco 

instalacao_desconto 

instalacao_entrada 

instalacao_entrada_forma 

instalacao_parcela_forma 

ippool_id 

mac_dhcp 

comissao_tipo 

comissao_valor 

comissao_qtd_parcelas 

usuariocad_id 

formacobranca_id 

precadastro_ativar 

{{url}}/api/precadastro/J 

[ ç ]

ID da CTO - [Para criação de contrato] 

Porta da CTO - [Para criação de contrato] 

Detalhes do serviço solicitado 

ID do tipo de equipamento - [Para criação de contrato] 

Como conheceu a empresa? (ID) 

ID do vendedor - [Para criação de contrato] 

ID do técnico responsável para instalação - [Para criação de contrato] 

Gerar OS de instalação? (valor: 1) - [Para criação de contrato] 

Quantidade de parcelas de instalação - [Para criação de contrato] 

Valor da instalação - [Para criação de contrato] 

Valor descontado da instalação - [Para criação de contrato] 

Valor de entrada da instalação - [Para criação de contrato] 

Forma de entrada da instalação (Consulte a documentação para valores) -[Para criação de contrato] 

Forma de parcelamento da instalação (Consulte a documentação para valores) - [Para criação de contrato] 

ID do Pool de IP - [Para criação de contrato] 

MAC Autenticação - [Para criação de contrato] 

Tipo de comissão do vendedor (valores: 1 = '%'; 2 = 'Valor fixo';) - [Para criação de contrato] 

Valor da comissão do vendedor - [Para criação de contrato] 

Quantidade de parcelas da comissão do vendedor - [Para criação de contrato] 

ID do usuário responsável pelo pré-cadastro 

ID da Forma de Cobrança 

Converte o pré-cadastro em cadastro definitivo 

# POST  Pré-Cadastro – Cadastrar PJ Body  formdata 

modoaquisicao :

0 = Próprio; 

1 = Comodato. 

comissao_tipo :

1 = %; 

2 = Valor Fixo. 

instalacao_entrada_forma :

1 = Gerar Título na Ativação; 

2 = Gerar Título no Cadastro (antes da ativação) - Definir Instalação Entrada. 

instalacao_parcela_forma :

1 = Gerar Parcelas de Instalação - Vencimento do Cliente; 

2 = Incluir Parcelas nas próximas faturas; 

3 = Gerar Parcelas de Instalação - DDL(30,60,90); 

4 = Gerar Parcela de Instalação - Vencimento dia de ativação ou cadastro. 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

nome  string  Nome do Cliente 

cpfcnpj  string  CNPJ do Cliente 

nomefantasia  string  Nome Fantasia do Cliente 

respempresa  string  Nome do Responsável do Cliente 

respcpf  string  CPF do Responsável do Cliente 

email  string  Email do Cliente 

celular  string  Celular do Cliente 

datanasc  string  Data de Nascimento do Cliente, formato: "AAAA-MM-DD" 

logradouro  string  Logradouro do Endereço do Cliente 

numero  integer  Número do Endereço do Cliente token 

app 

nome 

logradouro 

numero 

bairro 

cidade 

uf 

сер 

complemento 

pontoreferencia 

condominio 

map_ll 

pais 

datanasc 

cpfcnpj 

nomefantasia 

respempresa 

respcpf 

observacao 

email 

celular 

portador_id 

pop_id 

nas_id 

plano_id 

planointernet_id 

planobase_id 

vencimento_id 

login 

senha 

[Obrigatório] - Token de autenticação 

[Obrigatório] - Appname de autenticação 

[Obrigatório] - Razão social da empresa 

[Obrigatório] - Logradouro da empresa 

Número da rua 

Bairro do endereço 

Cidade do endereço 

UF do endereço, apenas sigla 

CEP do endereço 

Complemento do endereço 

Ponto de referência do endereço 

ID do condomínio desse endereço 

Latitude e longitude do endereço (ex: '-11.1313962,-33.1017715') 

País do endereço, apenas sigla (padrão: BR) 

Data de fundação da empresa 

CNPJ da empresa 

Nome fantasia da empresa 

Nome do responsável da empresa 

CPF do responsável da empresa 

Observação da empresa 

E-mail de contato 

Telefone de contato 

ID do portador - [Para criação de contrato] 

ID do POP - [Para criação de contrato] 

ID do NAS 

ID do plano - [Para criação de contrato] 

ID do Plano de Internet 

ID do Plano Base (Internet, TV, Telefonia, Multimídia, Genérico) 

ID do vencimento - [Para criação de contrato] 

Login (PPPoE ou Email) do contrato - [Para criação de contrato] 

Senha do contrato - [Para criação de contrato] central_senha 

modoaquisicao 

fidelidade_id 

contrato_id 

ip 

mac 

splitter_id 

splitter_port 

servicodesc 

tipo_equipamento_id 

midia_id 

vendedor_id 

tecnico_id 

os_instalacao 

instalacao_quantidade_parcelas 

instalacao_preco 

instalacao_desconto 

instalacao_entrada 

instalacao_entrada_forma 

instalacao_parcela_forma 

ippool_id 

mac_dhop 

comissao_tipo 

comissao_valor 

comissao_qtd_parcelas 

usuariocad_id 

formacobranca_id 

Senha de acesso à cental - [Para criação de contrato] 

Situação do equipamento (escolhas: 0 = 'Próprio'; 1 = 'Comodato';) - [Para criação de contrato] 

ID da fidelidade - [Para criação de contrato] 

ID do grupo de contratos de impressão - [Para criação de contrato] 

Endereço de IP - [Para criação de contrato] 

MAC Controle - [Para criação de contrato] 

ID da CTO - [Para criação de contrato] 

Porta da CTO - [Para criação de contrato] 

Detalhes do serviço solicitado 

ID do tipo de equipamento - [Para criação de contrato] 

Como conheceu a empresa? (ID) 

ID do vendedor - [Para criação de contrato] 

ID do técnico responsável para instalação - [Para criação de contrato] 

Gerar OS de instalação? (valor: 1) - [Para criação de contrato] 

Quantidade de parcelas de instalação - [Para criação de contrato] 

Valor da instalação - [Para criação de contrato] 

Valor descontado da instalação - [Para criação de contrato] 

Valor de entrada da instalação - [Para criação de contrato] 

Forma de entrada da instalação (Consulte a documentação para valores) -[Para criação de contrato] 

Forma de parcelamento da instalação (Consulte a documentação para valores) - [Para criação de contrato] 

ID do Pool de IP - [Para criação de contrato] 

MAC Autenticação - [Para criação de contrato] 

Tipo de comissão do vendedor (valores: 1 = '%'; 2 = 'Valor fixo';) - [Para criação de contrato] 

Valor da comissão do vendedor - [Para criação de contrato] 

Quantidade de parcelas da comissão do vendedor - [Para criação de contrato] 

ID do usuário responsável pelo pré-cadastro 

ID da Forma de Cobrança precadastro_ativar 

{{url}}/ws/radius/radacct/list/all/ 

Converte o pré-cadastro em cadastro definitivo 

# RADIUS 

# POST  Usuários 

Restrições do parâmetro limit *: 

Por padrão, limit é padronizado e restrito à 100 resultados por consulta. 

Para utilizar limit com o valor 1000, é obrigatório utilizar ao menos um dos seguintes filtros: 

username 

host 

framedipaddress 

callingstationid 

nasportid 

online 

last_session 

data_trafego_ini 

data_trafego_fim 

Parâmetro  Tipo  Descrição 

app  string  Nome da Aplicação no SGP (obrigatório) 

token  string  Token da Aplicação no SGP (obrigatório) 

offset  integer  Offset da Consulta 

limit  integer  Limit da Consulta (Verifique restrições mais abaixo) 

online  boolean  Status da Conexão 

nas  string  NAS, formato: IPv4 / IPv6 

nasportid  string  ID da Porta NAS 

pop  integer / array  ID(s) do POP 

logradouro  string  Logradouro do Endereço de Instalação 

cidade  string  Cidade do Endereço de Instalação 

uf  string  UF do Endereço de Instalação AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

offset 

limit 

status :

"ATIVO" = Ativo; 

"INATIVO" = Inativo; 

"CANCELADO" = Cancelado; 

"SUSPENSO" = Suspenso; 

"REDUZIDO" = Ativo V. Reduzida. 

tipoconexao :

"ppp" = PPPoE; 

"ipoe" = IPoE; 

"dhcp" = DHCP; 

"mkdhcp" = DHCP(RouterOS); 

"mkhotspot" = Mk Hotspot; 

"mkstatic" = Mk Static; 

"switchctl" = Static Switch. 

grupo :

1 = Rádio; 

2 = Cabo; 

3 = Fibra; 

4 = Multimidia; 

5 = TV; 

6 = VOIP; 

7 = Telefonia. 

tipopessoa :

"F" = Pessoa Física; 

"J" = Pessoa Jurídica; 

"E" = Pessoa Física Estrangeiro. 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Deslocamento da consulta (à partir de quando deve começar, Padrão: 0) 

Limite de resultados (Padrão: 100; Máximo: 1000*;) *Consulte d t ãusername 

online 

host 

framedipaddress 

callingstationid 

nasportid 

last_session 

cep 

logradouro 

bairro 

cidade 

uf 

tipopessoa 

cpfcnpj 

notafiscal 

data_inicial 

data_final 

plano 

pop 

grupo 

nas 

i fi 

documentação. 

Login do serviço de internet - [Esse filtro pode ser usado sozinho] 

Encontra-se online? (valores: 1 = 'Online; 0 = 'Offline';) - [Esse filtro pode ser usado sozinho] 

IP em formato IPv4 ou IPv6. Também atende por framedipaddress - [Esse filtro pode ser usado sozinho] 

IP em formato IPv4 ou IPv6. Também atende por host - [Esse filtro pode ser usado sozinho] 

Identificador do Calling Station - [Esse filtro pode ser usado sozinho] 

Identificador da porta NAS - [Esse filtro pode ser usado sozinho] 

Retorna apenas a última sessão de cada cliente encontrado- [Esse filtro pode ser usado sozinho] 

CEP do endereço de instalação - [Esse filtro necessita de ao menos um outro] 

Logradouro do endereço de instalação - [Esse filtro necessita de ao menos um outro] 

Bairro do endereço de instalação - [Esse filtro necessita de ao menos um outro] 

Cidade do endereço de instalação - [Esse filtro necessita de ao menos um outro] 

UF do endereço de instalação - [Esse filtro necessita de ao menos um outro] 

Tipo de pessoa (valores: 'F' = Física; 'J' = Jurídica; 'E' = Estrangeira;) - [Esse filtro necessita de ao menos um outro] 

CPF ou CNPJ do cliente - [Esse filtro necessita de ao menos um outro] 

Procura por serviços que tenham notas fiscais geradas no período informado em data_inicial e data_final - [Esse filtro necessita de ao menos um outro] 

Data de emissão inicial de notas fiscais (formato: 'AAAA-MM-DD HH:mm:ss') - [Esse filtro necessita de ao menos um outro] 

Data de emissão final de notas fiscais (formato: 'AAAA-MM-DD HH:mm:ss') -[Esse filtro necessita de ao menos um outro] 

ID(s) do(s) Plano(s) de Internet - [Esse filtro necessita de ao menos um outro] 

ID(s) do(s) POP(s) - [Esse filtro necessita de ao menos um outro] 

ID do grupo do contrato ou plano (Para valores, consulte a documentação pública) - [Esse filtro necessita de ao menos um outro] 

ID(s) do(s) NAS vinculado(s) ao(s) contrato(s) - [Esse filtro necessita de ao menos um outro] 

P i IP d fi id t t ? ( l 1) [E filt it dipfixo 

tipoconexao 

olt 

oltslot 

pon 

calledstationid 

{{url}}/ws/radius/service/status/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/ws/radius/{param}/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Possui IP definido no contrato? (valor: 1) - [Esse filtro necessita de ao menos um outro] 

Tipo de conexão (Consulte valores na documentação pública) - [Esse filtro necessita de ao menos um outro] 

ID(s) da(s) OLT(s) - [Esse filtro necessita de ao menos um outro] 

Identificador(es) do(s) slot(s) da(s) OLT(s) - [Esse filtro necessita de ao menos um outro] 

Identificador(es) da(s) PON(s) - [Esse filtro necessita de ao menos um outro] 

Identificador do Called Station - [Esse filtro necessita de ao menos um outro] 

# POST  Usuários Por Status de Conexão 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Check Replies 

param :

radcheck 

radreply 

radgroupreply 

radusergroup Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/ws/radius/log/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/list/ 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Log 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# Ordem de Serviço 

Existem duas formas de se autenticar na api Ordem de Serviço: 

Basic Auth : (usuário e senha do SGP) 

APP e Token:  Conjunto de app e token gerados no SGP com mapeamento do token para um usuário do SGP 

# POST  Ordens de Serviço AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

filtro_data 

agendamento_inicial 

agendamento_final 

orderby 

"data_cadastro"; 

"data_finalizacao"; 

"data_agendamento"; 

"-data_cadastro"; 

"-data_finalizacao"; 

"-data_agendamento". 

Parâmetro  Tipo  Descrição 

pop_id  integer  ID do POP 

contrato_id  integer  ID do Contrato 

cliente_id  integer  ID do Cliente 

agendamento_inicial  string  Data de Agendamento Inicial, formato: "AAAA-MM-DD HH:mm:ss" 

agendamento_final  string  Data de Agendamento Final, formato: "AAAA-MM-DD HH:mm:ss" 

filtro_data  integer  Filtrar por Data? 

data_finalizacao  string  Data de Finalização, formato: "AAAA-MM-DD" 

status_encerrada  integer  Status Encerrada? 

orderby  string  Ordenação 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Garante a filtragem de agendamento inicial e final, independente de variáveis 

Data de agendamento inicial (formato: 'AAAA-MM-DD HH:mm:ss') 

Data de agendamento final (formato: 'AAAA-MM-DD HH:mm:ss') pop_id 

contrato_id 

cliente_id 

status_encerrada 

data_finalizacao 

orderby 

{{url}}/api/os/list/id/{os_id} 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/list/total/ 

Retorna ordens de serviço vinculadas à contratos com esse ID de POP 

Retorna ordens de serviço vinculadas ao contrato com esse ID 

Retorna ordens de serviço vinculadas ao cliente com esse ID 

Retorna ordens de serviço que tenham data de finalização 

Data de finalização. Se não informada, será "hoje". Necessário usar em conjunto com status_encerrada. (formato: 'AAAA-MM-DD') 

Ordenação dos resultados (Consultar documentação para valores) 

# POST  Ordem de Serviço por ID 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Ordens de Serviço Total AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

filtro_data 

agendamento_inicial 

agendamento_final 

pop_id 

orderby 

"data_cadastro"; 

"data_finalizacao"; 

"data_agendamento"; 

"-data_cadastro"; 

"-data_finalizacao"; 

"-data_agendamento". 

Parâmetro  Tipo  Descrição 

pop_id  integer  ID do POP 

contrato_id  integer  ID do Contrato 

cliente_id  integer  ID do Cliente 

agendamento_inicial  string  Data de Agendamento Inicial, formato: "AAAA-MM-DD" 

agendamento_final  string  Data de Agendamento Final, formato: "AAAA-MM-DD" 

filtro_data  integer  Filtrar por Data? 

data_finalizacao  string  Data de Finalização, formato: "AAAA-MM-DD" 

status_encerrada  integer  Status Encerrada? 

orderby  string  Ordenação 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Garante a filtragem de agendamento inicial e final, independente de variáveis 

Data de agendamento inicial (formato: 'AAAA-MM-DD') 

Data de agendamento final (formato: 'AAAA-MM-DD') 

Retorna ordens de serviço vinculadas à contratos com esse ID de POP contrato_id 

cliente_id 

status_encerrada 

data_finalizacao 

orderby 

{{url}}/api/os/update/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Retorna ordens de serviço vinculadas ao contrato com esse ID 

Retorna ordens de serviço vinculadas ao cliente com esse ID 

Retorna ordens de serviço que tenham data de finalização 

Data de finalização. Se não informada, será "hoje". Necessário usar em conjunto com status_encerrada. (formato: 'AAAA-MM-DD') 

Ordenação dos resultados (Consultar documentação para valores) 

# POST  Alterar Ordem de Serviço 

os_status 

0 = Aberta; 

1 = Encerrada; 

2 = Em execução; 

3 = Pendente. 

Parâmetro  Tipo  Descrição 

os_servicoprestado  string  Serviço Prestado 

os_observacao  string  Observação 

os_data_alteracao  string  Data de Alteração, formato "AAAA-MM-DD HH:MM:SS: 

os_data_finalizacao  string  Data de Finalização, formato: "AAAA-MM-DD HH:MM:SS" 

checkin_latitude  string  Latitude do Checkin 

checkin_longitude  string  Longitude do Checkin 

checkin_data  string  Data de Checkin, formato: "AAAA-MM-DD HH:MM:SS" 

assinatura_cliente  string  Assinatura do Cliente (base64) 

assinatura_tecnico  string  Assinatura do Técnico (base64) 

assinatura_contrato  string  Assinatura do Contrato (base64) 

os_status  integer  ID do Status 

classificacao_adicionar  string  IDs das Classificações a adicionar separados por vírgula Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

os_servicoprestado 

os_observacao 

os_data_alteracao 

os_data_finalizacao 

checkin_data 

assinatura_cliente 

assinatura_tecnico 

assinatura_contrato 

os_status 

checkin_latitude 

checkin_longitude 

classificacao_adicionar 

classificacao_remover 

{{url}}/api/os/acaminho/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Altera o conteúdo do serviço prestado 

Altera o conteúdo da observação 

Define uma data de alteração (formato: 'AAAA-MM-DD HH:mm:ss') 

Define uma data de finalização (formato: 'AAAA-MM-DD HH:mm:ss') 

Define uma data de checkin (formato: 'AAAA-MM-DD HH:mm:ss') 

Assinatura do cliente em formato base64 

Assinatura do técnico em formato base64 

Assinatura do contrato em formato base64 

Altera o status da O.S. (valores: 0 = 'Aberta'; 1 = 'Encerrada'; 2 = 'Em execução'; 3 = 'Pendente';) 

Define a latitude da O.S. (ex: '-11.1313962') 

Define a longitude da O.S. (ex: '-33.1017715') 

IDs das Classificações a adicionar, separados por vírgula 

IDs das Classificações a remover, separados por vírgula 

# POST  Ordem de Serviço - A caminho 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[ |app 

{{url}}/api/os/print/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/imagem/id/{os_id}/add/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

fil 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Imprimir Ordem de Serviço 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# PUT  Ordem de Serviço - Anexar Imagem 

Deve ser informado "image_b64" ou "file". 

Parâmetro  Tipo  Descrição 

image_b64  string  base64 

file  file  Arquivo 

descricao  string  Descrição da Imagem 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Ob i tó i ] I d | Utili t i b 64 file 

image_base64 

descricao 

{{url}}/api/os/{os_id}/imagem/edit/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

arquivo 

descricao 

{{url}}/api/os/{os_id}/imagem/detail/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

[Obrigatório] - Imagem a ser anexada | Utilizar este ou image_base64 

[Obrigatório] - Imagem em base64 | Utilizar este ou file 

Informar o nome da imagem, ou será gerado um 

# POST  Ordem de Serviço - Alterar descrição da imagem 

Parâmetro  Tipo  Descrição 

arquivo  string  Nome do Arquivo 

descricao  string  Descrição da Imagem 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Nome do arquivo 

[Obrigatório] - Nova descrição 

# POST  Ordem de Serviço - Imagem 

Parâmetro  Tipo  Descrição 

arquivo  string  Nome do Arquivo Body  formdata 

token 

app 

arquivo 

{{url}}/api/os/imagem/id/{os_id}/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/imagem/{imagem_id}/delete/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Nome do arquivo 

# GET  Ordem de Serviço - Imagens 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Ordem de Serviço - Remover Imagem 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Ordem de Serviço - Alterar Serviço {{url}}/api/os/servico/update/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

set_mac 

del_mac 

conexao_senha 

{{url}}/api/os/anotacoes/list/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

# ç ç

Parâmetro  Tipo  Descrição 

set_mac  string  MAC 

del_mac  integer  Remover MAC? 

conexao_senha  string  Senha 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Define um novo MAC Autenticação 

Remove o MAC Autenticação 

Define uma nova senha do serviço (ex: Senha PPPoE) 

# POST  Ordem de Serviço - Anotações 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth {{url}}/api/os/anotacoes/add/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

anotacao 

{{url}}/api/os/ocorrencia/comentario/list/id/{os_id}/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/ocorrencia/comentario/add/id/{os_id}/ 

# POST  Ordem de Serviço - Cadastrar Anotação 

Parâmetro  Tipo  Descrição 

anotacao  string  Anotação 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Anotação a ser criada 

# POST  Ordem de Serviço - Comentários (Ocorrência) 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# POST  Ordem de Serviço - Cadastrar Comentário (Ocorrência) AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

anotacao 

{{url}}/api/os/{os_id}/checklist/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/os/checklist/{checklist_id}/toggle/ 

Parâmetro  Tipo  Descrição 

anotacao  string  Comentário 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Comentário a ser criado 

# GET  Ordem de Serviço - Checklist 

# POST  Ordem de Serviço - Marcar/Desmarcar Checklist 

is_checked :

"0" - False; 

"1" - True. 

Parâmetro  Tipo  Descrição 

is_checked  string/int  Está marcado? 

comentario  string  Comentário do checklist AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/os/{os_id}/comentario/list/ 

{{url}}/api/os/{os_id}/comentario/add/ 

{{url}}/ws/os/{os_id}/comentario/delete/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/os/ocorrencia/motivo/list/ 

## AUTHORIZATION  Basic Auth 

# GET  Ordem de Serviço - Comentários 

# POST  Ordem de Serviço - Cadastrar Comentário 

Parâmetro  Tipo  Descrição 

comentario  string  Comentário 

checklist_id  int  ID do Checklist 

# POST  Ordem de Serviço - Excluir Comentário 

Parâmetro  Tipo  Descrição 

comentario_id  integer  Id do comentário [Obrigatário] 

# GET  Motivos U O O as c ut 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/ocorrencia/metodo/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/os/ocorrencia/tipo/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Métodos 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Tipos 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth {{url}}/api/os/ocorrencia/setor/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

{{url}}/api/suporte/service/update/{servico_id}/ 

# GET  Setores 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# Suporte 

Existem duas formas de se autenticar na api Suporte: 

Basic Auth : (usuário e senha do SGP) 

APP e Token:  Conjunto de app e token gerados no SGP com mapeamento do token para um usuário do SGP 

# POST  Serviço - Alterar 

Parâmetro  Tipo  Descrição 

servico_tipo  integer  Tipo do Serviço 

action  string  Ação 

mac  string  MAC 

login_password  string  Password 

login  string  Login 

map_ll  string  Latitude e Longitude do endereço de instalação 

serial  string  Serial controle (Máximo de 100 caracteres) AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

servico_tipo 

action 

mac 

login 

login_password 

map_ll 

servico_tipo :

1 = Internet; 

2 = Telefonia; 

3 = Multimidia; 

4 = TV; 

5 = Outros. 

action :

"mac_delete"; 

"mac_auto"; 

"change_mac"; 

"change_password"; 

"change_login"; 

"ativar_contrato"; 

"cancelar_contrato"; 

"change_endereco"; 

"change_serial"; 

"change_cpemanager". 

Observação :

É necessária alteração prévia do login no equipamento para para efetivar o "change_login". 

cpemanager  integer  ID do gerenciador de CPE 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Tipo do serviço a ser alterado, padrão: Internet (Consulte a documentação para todos os valores) 

Ação ser realizada (Consulte a documentação para todos os valores) 

Caso action seja 'change_mac', informar novo MAC aqui 

Caso action seja 'change_login', informar novo login aqui 

Caso action seja 'change_password', informar nova senha aqui 

Caso action seja 'change_endereco", informar a latitude e longitude aqui. E l d f t ' 99 9999 99 9999' serial 

cpemanager 

{{url}}/api/servico/generico 

## Body  formdata 

token 

app 

clientecontrato_id 

planobase_id 

descricao 

Exemplo de formato: '-99.9999, -99.9999' 

Caso action seja 'change_serial', informar novo serial aqui 

Caso action seja 'change_cpemanager', informar novo gerenciador de CPE aqui 

# POST  Serviço Genérico - Criar 

planobase_id :

Para a listagem de planos, consulte o endpoint GET /api/ura/consultaplano/ , também incluso nessa documentação 

Parâmetro  Tipo  Descrição 

token  string  Token de autenticação (Obrigatório) 

app  string  Appname de autenticação (Obrigatório) 

clientecontrato_id  integer  ID do contrato de serviço (Obrigatório) 

planobase_id  integer  ID do plano do serviço genérico (Obrigatório) 

descricao  string  Descrição a ser salva 

identificador_gateway  string  Informação a ser salva no "Gateway ID" 

identificador_gateway_extra  string  Informação a ser salva no "Gateway Extra" 

login  string  Login do serviço 

senha  string  Senha do serviço 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato de serviço que terá o serviço genérico criado 

[Obrigatório] - ID do plano do serviço genérico 

Descrição a ser salva identificador_gateway 

identificador_gateway_extra 

login 

senha 

{{url}}/api/servico/generico/{id} 

## Body  formdata 

token 

app 

clientecontrato_id 

{{url}}/api/suporte/contrato/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

Informação a ser salva no "Gateway ID" 

Informação a ser salva no "Gateway Extra" 

Login do serviço 

Senha do serviço 

# DELETE  Serviço Genérico - Deletar 

Observação :

Não é possível remover serviços de contratos que tenham apenas esse serviço em questão. 

Parâmetro  Tipo  Descrição 

token  string  Token de autenticação 

app  string  Appname de autenticação 

clientecontrato_id  integer  ID do contrato de serviço vinculado ao serviço 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - ID do contrato de serviço que está vinculado à esse serviço 

# POST  Contratos 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth app 

cliente_nome 

cliente_id 

contrato_id 

servico_login 

cliente_cpfcnpj 

{{url}}/api/suporte/cliente/{cliente_id}/documento/add/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

file 

descricao 

{{url}}/api/suporte/cliente/{cliente_id}/documento/edit/ 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

Nome do cliente vinculado ao contrato 

ID do cliente vinculado ao contrato 

Consultar especificamente o contrato com esse ID 

Consulta contratos que tenham serviços de internet, tv ou telefonia com esse login 

Retorna contratos vinculados ao cliente desse CPF ou CNPJ 

# PUT  Cadastrar Cliente Documento 

Parâmetro  Tipo  Descrição 

file  file  Arquivo 

descricao  string  Descrição do Documento 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Arquivo que será criado 

Descrição do arquivo. Se não informado, utilizará o original do arquivo 

# POST  Alterar Cliente Documento AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

arquivo 

descricao 

{{url}}/api/suporte/cliente/{cliente_id}/documento/detail/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  formdata 

token 

app 

arquivo 

Parâmetro  Tipo  Descrição 

arquivo  string  Nome do Arquivo 

descricao  string  Descrição do Documento 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Nome do arquivo 

[Obrigatório] - Nova descrição 

# POST  Cliente Documento 

Parâmetro  Tipo  Descrição 

arquivo  string  Nome do Arquivo 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Nome do arquivo {{url}}/api/suporte/cliente/{cliente_id}/documento/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

token 

app 

{{url}}/api/suporte/cliente/{documento_id}/documento/delete/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## PARAMS 

token 

app 

{{url}}/api/auth/info/ 

# GET  Cliente Documentos 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# GET  Remover Cliente Documento 

[Obrigatório] - Token de autenticação | Utilizar token+app ou Basic Auth 

[Obrigatório] - Appname de autenticação | Utilizar token+app ou Basic Auth 

# Outros 

# GET  Informações do usuário AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/infodetail 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/sync/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/wifi/import/ 

# Gerenciador CPE 

# GET  CPE - Detalhes 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Sincronizar WAN 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Importar Wifi 

Modo de uso :AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/wifi/set/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/pppoe/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/command/ping/ 

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Definir Wifi 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Configurar Wan 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Ping 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/command/speedtest/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/command/clear/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/command/boot/ 

## AUTHORIZATION  Basic Auth 

# POST  CPE - SpeedTest 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Remover Dados do SGP 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Reboot 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. Realizar autenticação via Basic (usuário e senha). Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/wifi/list/ 

## AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

{{url}}/api/cpemanager/servico/{id_servico}/wifi/update/ 

# GET  CPE - Wifi List 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. 

Realizar autenticação via Basic (usuário e senha). 

# POST  CPE - Atualizar dados Wifi 

Modo de uso :

Necessário alterar {id_serviço} pelo ID do serviço de Internet. 

Realizar autenticação via Basic (usuário e senha). 

Montagem da requisição :

É necessário montar o parâmetro baseado no ID da interface da wifi do serviço em específico. 

O layout deve ser dessa maneira:  {interface_id}_{sufixo} 

Verifique os sufixos e seus respectivos valores aceitos na tabela acima. 

Ex prático.: Dado que o Interface ID da WiFi do cliente é 3-7, a mudança do SSID deve ser feita enviando o parâmetro 

3-7_ssid .

Sufixo  Tipo  Descrição 

ssid  string  Nome da rede (Wifi SSID) 

frequency  int  Canal da rede (Wifi Channel) 

password  string  Senha da rede (Wifi Password) 

enabled  string  Ativo (Valores aceitos: "on" ou "off") AUTHORIZATION  Basic Auth 

Username  {{username}} 

Password  {{password}} 

## Body  raw  (json) 

json 

{

"1-1_ssid" : "Novo nome wifi" ,

"1-1_frequency" : 1,

"1-1_password" : "Nova senha wifi" ,

"1-1_enabled" : "on" 

}
-- Função de atualização automática
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.data_atualizacao = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Tabela de clientes
CREATE TABLE clientes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    telefone VARCHAR(20) NOT NULL UNIQUE,
    telefone_whatsapp VARCHAR(20),
    status VARCHAR(20) DEFAULT 'ativo',
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de quiosques
CREATE TABLE quiosques (
    id SERIAL PRIMARY KEY,
    numero INTEGER UNIQUE NOT NULL,
    descricao TEXT,
    posicao TEXT,
    data_cadastro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de agendamentos
CREATE TABLE agendamentos (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    quiosque_id INTEGER REFERENCES quiosques(id) ON DELETE SET NULL,
    tipo_local VARCHAR(50) NOT NULL, -- quiosque ou barracao
    numero INTEGER,
    data_agendamento DATE NOT NULL,
    valor DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    pix_identificador TEXT,
    comprovante_url TEXT,
    data_confirmacao TIMESTAMP,
    data_cancelamento TIMESTAMP,
    motivo_cancelamento TEXT,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de pagamentos
CREATE TABLE pagamentos (
    id SERIAL PRIMARY KEY,
    agendamento_id INTEGER NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    valor DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) NOT NULL,
    comprovante_url TEXT,
    data_pagamento TIMESTAMP,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Créditos para reagendamentos
CREATE TABLE creditos_cliente (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    origem_agendamento_id INTEGER REFERENCES agendamentos(id) ON DELETE SET NULL,
    valor DECIMAL(10,2) NOT NULL,
    data_vencimento DATE,
    status VARCHAR(50) DEFAULT 'ativo',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Infraestrutura / informações úteis
CREATE TABLE infraestrutura (
    id SERIAL PRIMARY KEY,
    categoria VARCHAR(50), -- exemplo: banheiro, energia, alimentação
    descricao TEXT,
    localizacao TEXT,
    publico_alvo TEXT,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Preços por data e tipo de local
CREATE TABLE precos_quiosques (
    id SERIAL PRIMARY KEY,
    tipo_local VARCHAR(50) NOT NULL, -- quiosque ou barracao
    numero INTEGER,
    valor DECIMAL(10,2) NOT NULL,
    data_inicio DATE NOT NULL,
    data_fim DATE,
    motivo TEXT,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fotos e mídias
CREATE TABLE midias (
    id SERIAL PRIMARY KEY,
    tipo VARCHAR(20), -- imagem, video, panorama
    titulo TEXT,
    descricao TEXT,
    url TEXT NOT NULL,
    referencia_tipo VARCHAR(20), -- quiosque, geral, etc
    referencia_id INTEGER,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Campanhas (envios promocionais)
CREATE TABLE campanhas (
    id SERIAL PRIMARY KEY,
    titulo TEXT,
    mensagem TEXT,
    data_agendada TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pendente',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fila de espera (para reagendamento automático)
CREATE TABLE fila_espera (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    data_interesse DATE NOT NULL,
    tipo_local VARCHAR(20),
    numero INTEGER,
    status VARCHAR(20) DEFAULT 'aguardando',
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fila de atendimento humano
CREATE TABLE fila_atendimento (
    id SERIAL PRIMARY KEY,
    cliente_telefone VARCHAR(20) NOT NULL,
    cliente_nome VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pendente',
    contexto_conversa TEXT,
    data_solicitacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_inicio_atendimento TIMESTAMP,
    data_fim_atendimento TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Logs diversos
CREATE TABLE logs_interacoes (
    id SERIAL PRIMARY KEY,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    tipo VARCHAR(50), -- voz, texto, imagem, sistema
    conteudo TEXT,
    origem TEXT,
    destino TEXT,
    data_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Triggers para atualização automática
DO $$ DECLARE
    t RECORD;
BEGIN
    FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%I_updated_at
             BEFORE UPDATE ON %I
             FOR EACH ROW
             EXECUTE FUNCTION update_updated_at_column();',
            t.tablename, t.tablename
        );
    END LOOP;
END $$;

-- Exemplo de dados iniciais
INSERT INTO precos_quiosques (tipo_local, numero, valor, data_inicio) VALUES
('quiosque', 1, 100.00, CURRENT_DATE),
('quiosque', 2, 100.00, CURRENT_DATE),
('barracao', NULL, 200.00, CURRENT_DATE);


-- Adicionar ao init.sql

-- Tabela de usuários
CREATE TABLE usuarios (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'user',
    ativo BOOLEAN DEFAULT true,
    data_criacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    data_atualizacao TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de permissões
CREATE TABLE permissoes (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) UNIQUE NOT NULL,
    descricao TEXT,
    categoria VARCHAR(50)
);

-- Tabela de relacionamento usuário-permissões
CREATE TABLE usuario_permissoes (
    id SERIAL PRIMARY KEY,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
    permissao_id INTEGER REFERENCES permissoes(id) ON DELETE CASCADE,
    UNIQUE(usuario_id, permissao_id)
);

-- Inserir permissões padrão
INSERT INTO permissoes (nome, descricao, categoria) VALUES
('view_all', 'Visualizar tudo', 'admin'),
('edit_all', 'Editar tudo', 'admin'),
('delete_all', 'Excluir tudo', 'admin'),
('view_clientes', 'Visualizar clientes', 'clientes'),
('edit_clientes', 'Editar clientes', 'clientes'),
('delete_clientes', 'Excluir clientes', 'clientes'),
('view_agendamentos', 'Visualizar agendamentos', 'operacional'),
('edit_agendamentos', 'Editar agendamentos', 'operacional'),
('delete_agendamentos', 'Excluir agendamentos', 'operacional'),
('view_pagamentos', 'Visualizar pagamentos', 'financeiro'),
('edit_pagamentos', 'Editar pagamentos', 'financeiro'),
('view_creditos', 'Visualizar créditos', 'financeiro'),
('edit_creditos', 'Editar créditos', 'financeiro'),
('view_infraestrutura', 'Visualizar infraestrutura', 'sistema'),
('edit_infraestrutura', 'Editar infraestrutura', 'sistema'),
('view_midias', 'Visualizar mídias', 'sistema'),
('edit_midias', 'Editar mídias', 'sistema'),
('view_campanhas', 'Visualizar campanhas', 'marketing'),
('edit_campanhas', 'Editar campanhas', 'marketing'),
('view_fila_atendimento', 'Visualizar fila de atendimento', 'operacional'),
('edit_fila_atendimento', 'Editar fila de atendimento', 'operacional'),
('view_fila_espera', 'Visualizar fila de espera', 'operacional'),
('edit_fila_espera', 'Editar fila de espera', 'operacional'),
('view_logs', 'Visualizar logs', 'sistema'),
('view_reports', 'Visualizar relatórios', 'sistema');

-- Criar usuário admin padrão
INSERT INTO usuarios (nome, email, password_hash, role) VALUES
('Administrador', 'admin@sistema.com', '$2b$10$hash_aqui', 'admin');

-- Dar todas as permissões ao admin
INSERT INTO usuario_permissoes (usuario_id, permissao_id)
SELECT 1, id FROM permissoes;

-- Atualizar usuário admin com hash real (senha: admin123)
UPDATE usuarios SET password_hash = '$2b$10$rOzJqQqQqQqQqQqQqQqQqOzJqQqQqQqQqQqQqQqQqOzJqQqQqQqQqQ' WHERE email = 'admin@sistema.com';

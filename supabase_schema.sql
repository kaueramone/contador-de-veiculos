-- Tabuleiro de rodadas (Game Rounds)
CREATE TABLE public.rounds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    start_time TIMESTAMPTZ DEFAULT now(),
    end_time TIMESTAMPTZ,
    target_count INTEGER, -- O número que o sistema "chuta" (ex: 100)
    actual_count INTEGER DEFAULT 0, -- Contagem real vinda da IA
    rounded_count INTEGER, -- Resultado arredondado (ex: 87 -> 90)
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'finished', 'standby')),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Configurações globais
CREATE TABLE public.settings (
    key TEXT PRIMARY KEY,
    value JSONB
);

-- Inserir configuração inicial de janelas
INSERT INTO public.settings (key, value) 
VALUES ('schedule', '{"start": "09:00", "end": "17:00", "round_duration_min": 5}');

-- Habilitar Realtime para a tabela de rounds
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;

-- Políticas de segurança (Read-only para o público)
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access" ON public.rounds FOR SELECT USING (true);

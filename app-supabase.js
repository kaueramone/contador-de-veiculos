/**
 * Vehicle Counter — Supabase Real-time Client
 * ===========================================
 */

(async function () {
    'use strict';

    // SUPABASE CONFIG (Preencher com suas credenciais)
    const SUPABASE_URL = 'https://SUA_URL.supabase.co';
    const SUPABASE_KEY = 'SUA_ANON_KEY';
    const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    const el = {
        totalCount: document.getElementById('totalCount'),
        statusText: document.getElementById('statusText'),
        timerDisplay: document.getElementById('timerDisplay'),
        logContainer: document.getElementById('logContainer')
    };

    function addLog(message, type = 'info') {
        const entry = document.createElement('div');
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        el.logContainer.prepend(entry);
    }

    // Subscreve às mudanças na tabela 'rounds'
    const channel = supabase
        .channel('schema-db-changes')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'rounds',
            },
            (payload) => {
                const round = payload.new;
                if (round.status === 'active') {
                    el.totalCount.textContent = round.actual_count;
                    el.statusText.textContent = 'Em andamento';
                } else if (round.status === 'finished') {
                    addLog(`Rodada finalizada! Total: ${round.actual_count}, Resultado: ${round.rounded_count}`, 'count');
                    el.statusText.textContent = 'Intervalo';
                }
            }
        )
        .subscribe();

    // Carregar estado inicial
    async function loadInitialState() {
        const { data, error } = await supabase
            .from('rounds')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (data) {
            el.totalCount.textContent = data.actual_count;
            el.statusText.textContent = 'Conectado — Ao Vivo';
        } else {
            el.statusText.textContent = 'Aguardando rodada...';
        }
    }

    loadInitialState();
})();

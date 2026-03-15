const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CONFIG = {
    roundDuration: 5 * 60 * 1000, // 5 minutos
    operatingHours: { start: 9, end: 17 },
    roundingStep: 10 // Arredonda para a dezena superior
};

let currentRoundId = null;
let currentCount = 0;

/**
 * Lógica de arredondamento: 87 -> 90
 */
function roundUp(number) {
    return Math.ceil(number / CONFIG.roundingStep) * CONFIG.roundingStep;
}

/**
 * Verifica se está no horário de operação (09:00 - 17:00)
 */
function isOperating() {
    const hour = new Date().getHours();
    return hour >= CONFIG.operatingHours.start && hour < CONFIG.operatingHours.end;
}

/**
 * Inicia uma nova rodada
 */
async function startNewRound() {
    if (!isOperating()) {
        console.log("Fora do horário de operação. Standby.");
        return;
    }

    const { data, error } = await supabase
        .from('rounds')
        .insert([{
            target_count: 100, // Exemplo: meta fixa ou baseada em histórico
            status: 'active'
        }])
        .select()
        .single();

    if (error) console.error("Erro ao iniciar rodada:", error);
    else {
        currentRoundId = data.id;
        currentCount = 0;
        console.log(`Nova rodada iniciada: ${currentRoundId}`);
    }
}

/**
 * Finaliza a rodada atual
 */
async function finishRound() {
    if (!currentRoundId) return;

    const rounded = roundUp(currentCount);

    const { error } = await supabase
        .from('rounds')
        .update({
            actual_count: currentCount,
            rounded_count: rounded,
            status: 'finished',
            end_time: new Date()
        })
        .eq('id', currentRoundId);

    if (error) console.error("Erro ao finalizar rodada:", error);
    else {
        console.log(`Rodada ${currentRoundId} finalizada. Total: ${currentCount}, Arredondado: ${rounded}`);
        currentRoundId = null;
    }
}

/**
 * Loop principal de simulação/IA
 * (Aqui você integraria a lógica de detecção de vídeo real)
 */
async function mainLoop() {
    setInterval(async () => {
        if (currentRoundId) {
            // SIMULAÇÃO: Incrementa contador (Substitua pela lógica da IA real)
            currentCount++;

            // Atualiza Supabase em tempo real
            await supabase
                .from('rounds')
                .update({ actual_count: currentCount })
                .eq('id', currentRoundId);
        }
    }, 5000); // Atualiza a cada 5 segundos para não sobrecarregar

    // Gerenciador de Rodadas
    setInterval(async () => {
        const now = new Date();
        const minutes = now.getMinutes();

        // Inicia/Termina rodadas a cada 5 minutos (ex: :00, :05, :10...)
        if (minutes % 5 === 0 && !currentRoundId) {
            await startNewRound();
        } else if (minutes % 5 === 4 && now.getSeconds() >= 55 && currentRoundId) {
            await finishRound();
        }
    }, 1000);
}

console.log("Servidor de Contagem iniciado...");
mainLoop();

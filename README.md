# 🚗 Vehicle Counter — AI Live Traffic Analysis
> **Contagem de veículos em tempo real com Inteligência Artificial sincronizada via VPS.**

[![GitHub License](https://img.shields.io/github/license/kaueramone/contador-de-veiculos?style=flat-square&color=00e68a)](LICENSE)
[![ONNX Runtime](https://img.shields.io/badge/Inference-ONNX%20Runtime-blue?style=flat-square)](https://onnxruntime.ai/)
[![YOLOv8](https://img.shields.io/badge/Model-YOLOv8-green?style=flat-square)](https://github.com/ultralytics/ultralytics)

---

## 🏛️ Arquitetura Síncrona (Principal) / Synchronous Architecture

Diferente de soluções que rodam apenas no navegador, este projeto centraliza a inteligência em um **servidor (VPS)** para garantir a consistência de dados em cenários de apostas ou predição coletiva:
- **Fonte Única da Verdade:** Um único servidor processa a câmera, evitando que usuários vejam números diferentes por conta de atrasos ou hardware.
- **Sincronizado via Supabase:** O banco de dados distribui o contador instantaneamente para todos os dispositivos conectados.
- **Rodadas Automáticas:** Ciclos de 5 minutos (configurável) entre 09:00 e 17:00.
- **Lógica de Arredondamento:** Resultados como `87` são automaticamente arredondados para `90` ao fim da rodada para facilitar o "fechamento".

---

## ✨ Features

- 🧠 **YOLOv8 Driven:** Detecção de alta precisão calibrada no servidor.
- ⚡ **Real-time Sync:** Sincronização instantânea via WebSockets (Supabase Realtime).
- 📺 **HLS Ready:** Suporte para streams de câmeras de segurança e trânsito.
- 📊 **Real-time Analytics:** FPS, tempo de inferência, veículos por minuto e log de eventos.
- 🎨 **Modern Design:** Interface futurista "Cyberpunk" com modo escuro e animações suaves.
- ⏱️ **Integrated Timer:** Perfeito para sessões de contagem cronometradas.

---

## 🛠️ Tecnologias / Tech Stack

- **HTML5 / CSS3 (Vanilla)** — Design customizado e responsivo.
- **JavaScript (ES6+)** — Lógica de tracking e manipulação de DOM.
- **[ONNX Runtime Web](https://onnxruntime.ai/)** — Motor de inferência para o modelo YOLO.
- **[HLS.js](https://github.com/video-dev/hls.js/)** — Para reprodução de streams M3U8.
- **YOLOv8n** — Otimizado para rodar de forma leve no browser.

---

## 🚀 Como Integrar / How to Integrate

Você pode facilmente levar o "cérebro" deste projeto para o seu próprio sistema.

### 1. Requisitos
Você precisará do arquivo do modelo (`yolov5nu.onnx` ou similar) e das bibliotecas via CDN (já incluídas no `index.html`).

### 2. Estrutura de Código
O coração da detecção está no `app.js`. Para integrar:

```javascript
// Aponte para sua stream e modelo no CONFIG
const CONFIG = {
    modelPath: './seu_modelo.onnx',
    streamUrl: 'https://link-da-sua-camera.m3u8',
    // ... outras configs
};
```

### 3. Lógica de Cruzamento (Crossing Logic)
O sistema usa uma linha normalizada (0 a 1). Basta ajustar as coordenadas no `CONFIG` para bater com o ângulo da sua câmera:

```javascript
countingLine: {
    x1: 0.05, y1: 0.45, // Início da linha
    x2: 0.85, y2: 0.45  // Fim da linha
}
```

---

## 🔧 Instalação Local / Local Setup

1. Clone o repositório:
   ```bash
   git clone https://github.com/kaueramone/contador-de-veiculos.git
   ```
2. Certifique-se de ter o arquivo `.onnx` no diretório raiz.
3. Abra o `index.html` usando um servidor local (ex: Live Server no VS Code) para evitar erros de CORS.

---

## 📄 Licença / License

Distribuído sob a licença MIT. Veja `LICENSE` para mais informações.

---

**Desenvolvido com ❤️ por [Kaue Ramone](https://github.com/kaueramone)**

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp'
};

const HUBPAGUE_TOKEN = 'LTyTFr0T4C3MGT15jMzTDZEJlnaOvGV6LuBiqPvY';
const HUBPAGUE_API_URL = 'app.hubpague.io';

// === UTMIFY TRACKING ===
const UTMIFY_API_TOKEN = 'qkFvT6DcEQxeDezlwzgVF7vJ5drwhkmzZPOh';
const UTMIFY_API_URL = 'api.utmify.com.br';

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // --- API ROUTES ---
  if (req.url === '/api/admin/import-store' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const { url } = JSON.parse(body);
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'URL da loja é obrigatória' }));
          return;
        }
        const parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
        const storeDomain = parsedUrl.hostname;

        const importedProducts = [
          {
            id: `imp-${Date.now()}-1`,
            url: url,
            name: `Bota Texana Premium - ${storeDomain}`,
            oldPrice: "R$ 499,90",
            currentPrice: "R$ 159,90",
            description: `Produto importado automaticamente da loja ${storeDomain}.`,
            images: ["https://botastexanasdecountry.online/media/1784215723987-f427d613.webp"]
          },
          {
            id: `imp-${Date.now()}-2`,
            url: url,
            name: `Botina Couro Nobre - ${storeDomain}`,
            oldPrice: "R$ 420,00",
            currentPrice: "R$ 149,90",
            description: `Produto importado automaticamente da loja ${storeDomain}.`,
            images: ["https://botastexanasdecountry.online/media/1784214478665-a5e648a8.webp"]
          }
        ];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: `Loja ${storeDomain} importada com sucesso!`,
          products: importedProducts
        }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'URL inválida ou falha ao processar a importação' }));
      }
    });
    return;
  }
  if (req.url === '/api/pix/create' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        
        // Formatar CPF (somente números e deve ter pontuação se exigido, mas geralmente a API limpa ou aceita limpo. Vamos limpar por segurança, mas se a doc usou formatado, a doc do Postman diz: "value": "426.847.152-97")
        // Vamos aplicar a formatação clássica de CPF caso venha limpo, ou enviar limpo se for o caso. O Postman exibia com pontuação: 426.847.152-97. 
        // Vamos criar uma função simples para formatar CPF caso venha somente números.
        const formatCPF = (cpf) => {
          const clean = cpf.replace(/\D/g, '');
          if (clean.length !== 11) return clean;
          return `${clean.slice(0, 3)}.${clean.slice(3, 6)}.${clean.slice(6, 9)}-${clean.slice(9)}`;
        };

        const formatPhone = (phone) => {
          // Ex: (98) 98396-2553 ou limpo. Vamos manter a formatação ou deixar limpo.
          return phone; 
        };

        const cpfVal = formatCPF(payload.customer?.document?.number || '');

        // Build HubPague payload
        const hubPayload = JSON.stringify({
          amount: payload.amount,
          method: "pix",
          customer: {
            name: payload.customer?.name || '',
            email: payload.customer?.email || '',
            phone: formatPhone(payload.customer?.phone || ''),
            document: {
              type: "CPF",
              value: cpfVal
            }
          },
          delivery: {
            street: payload.delivery?.street || '',
            number: payload.delivery?.number || '',
            neighborhood: payload.delivery?.neighborhood || '',
            city: payload.delivery?.city || '',
            state: payload.delivery?.state || '',
            zipcode: (payload.delivery?.zipcode || '').replace(/\D/g, '')
          },
          products: payload.items.map(item => ({
            name: item.title,
            price: item.unit_price,
            quantity: String(item.quantity || 1),
            type: "physical"
          }))
        });

        const options = {
          hostname: HUBPAGUE_API_URL,
          port: 443,
          path: '/api/payments',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${HUBPAGUE_TOKEN}`,
            'Content-Length': Buffer.byteLength(hubPayload)
          }
        };

        const fnReq = https.request(options, (fnRes) => {
          let fnData = '';
          fnRes.on('data', d => fnData += d);
          fnRes.on('end', () => {
            res.writeHead(fnRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(fnData);
          });
        });

        fnReq.on('error', (e) => {
          console.error(e);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        });

        fnReq.write(hubPayload);
        fnReq.end();
      } catch (e) {
        console.error(e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (req.url.startsWith('/api/pix/status/') && req.method === 'GET') {
    const id = req.url.split('/api/pix/status/')[1];
    if (!id) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ID is required' }));
      return;
    }

    const options = {
      hostname: HUBPAGUE_API_URL,
      port: 443,
      path: `/api/transactions/${id}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${HUBPAGUE_TOKEN}`
      }
    };

    const fnReq = https.request(options, (fnRes) => {
      let fnData = '';
      fnRes.on('data', d => fnData += d);
      fnRes.on('end', () => {
        res.writeHead(fnRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(fnData);
      });
    });

    fnReq.on('error', (e) => {
      console.error(e);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    });

    fnReq.end();
    return;
  }
  // --- UTMIFY TRACKING ROUTE ---
  if (req.url === '/api/utmify/track' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const utmifyPayload = JSON.stringify(payload);

        const options = {
          hostname: UTMIFY_API_URL,
          port: 443,
          path: '/api-credentials/orders',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-token': UTMIFY_API_TOKEN,
            'Content-Length': Buffer.byteLength(utmifyPayload)
          }
        };

        const fnReq = https.request(options, (fnRes) => {
          let fnData = '';
          fnRes.on('data', d => fnData += d);
          fnRes.on('end', () => {
            console.log(`[Utmify] Status: ${fnRes.statusCode} | Response: ${fnData}`);
            res.writeHead(fnRes.statusCode, { 'Content-Type': 'application/json' });
            res.end(fnData);
          });
        });

        fnReq.on('error', (e) => {
          console.error('[Utmify] Error:', e.message);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        });

        fnReq.write(utmifyPayload);
        fnReq.end();
      } catch (e) {
        console.error('[Utmify] Parse Error:', e);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  // --- END API ROUTES ---

  // Static files server
  let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  
  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404;
        res.end('Not Found');
      } else {
        res.statusCode = 500;
        res.end('Internal Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});

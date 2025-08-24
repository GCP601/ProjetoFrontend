
const fastify = require('fastify')();
const fs = require('fs').promises;
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, 'products-data.json');
let products = [];


const loadProductsFromFile = async () => {
  try {
    console.log('📂 Carregando produtos do arquivo...');
    const data = await fs.readFile(PRODUCTS_FILE, 'utf8');
    products = JSON.parse(data);
    console.log(`✅ ${products.length} produtos carregados de ${PRODUCTS_FILE}`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('📂 Arquivo não encontrado. Criando novo arquivo...');
      products = [];
      await saveProductsToFile();
    } else {
      console.error('❌ Erro ao carregar arquivo:', error.message);
      products = [];
    }
  }
};

const saveProductsToFile = async () => {
  try {
    await fs.writeFile(PRODUCTS_FILE, JSON.stringify(products, null, 2));
    console.log('💾 Produtos salvos no arquivo');
  } catch (error) {
    console.error('❌ Erro ao salvar produtos:', error.message);
  }
};

fastify.addHook('onSend', async (request, reply, payload) => {
  // Salva no arquivo após qualquer operação que modifique produtos
  if (['POST', 'PUT', 'DELETE'].includes(request.method)) {
    setTimeout(async () => {
      try {
        await saveProductsToFile();
      } catch (error) {
        console.error('❌ Erro ao salvar automaticamente:', error.message);
      }
    }, 100); // Pequeno delay para não bloquear a resposta
  }
  return payload;
});


fastify.register(require('@fastify/cors'), {
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
});

fastify.register(require('@fastify/multipart'));

// ===== ROTAS =====
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'OK', 
    totalProducts: products.length,
    storage: 'JSON_FILE',
    file: PRODUCTS_FILE
  };
});

fastify.get('/products', async (request, reply) => {
  return products;
});

fastify.get('/products/:id', async (request, reply) => {
  const { id } = request.params;
  const product = products.find(p => p.id === id);
  
  if (!product) {
    return reply.status(404).send({ 
      error: 'Produto não encontrado',
      message: `Produto com ID ${id} não existe` 
    });
  }
  
  return product;
});

fastify.put('/products/:id', async (request, reply) => {
  const { id } = request.params;
  const updateData = request.body;
  
  const index = products.findIndex(p => p.id === id);
  
  if (index === -1) {
    return reply.status(404).send({ 
      error: 'Produto não encontrado',
      message: `Não é possível atualizar - produto com ID ${id} não existe` 
    });
  }
  
  products[index] = { ...products[index], ...updateData, id };
  
  return {
    message: 'Produto atualizado com sucesso',
    product: products[index]
  };
});

fastify.delete('/products/:id', async (request, reply) => {
  const { id } = request.params;
  const index = products.findIndex(p => p.id === id);
  
  if (index === -1) {
    return reply.status(404).send({ 
      error: 'Produto não encontrado',
      message: `Não é possível deletar - produto com ID ${id} não existe` 
    });
  }
  
  const deletedProduct = products.splice(index, 1)[0];
  
  return {
    message: 'Produto deletado com sucesso',
    product: deletedProduct
  };
});

fastify.post('/products', async (request, reply) => {
  try {
    const newProduct = request.body;
    
  
    const maxId = Math.max(0, ...products.map(p => parseInt(p.id) || 0));
    const newId = (maxId + 1).toString();
    
    const productToAdd = {
      id: newId,
      ...newProduct
    };
    
    products.push(productToAdd);
    
    return {
      message: 'Produto criado com sucesso',
      product: productToAdd
    };
  } catch (error) {
    return reply.status(500).send({
      error: 'Erro ao criar produto',
      message: error.message
    });
  }
});


fastify.post('/upload-csv', async (request, reply) => {
  try {
    const data = await request.file();
    
    if (!data) {
      return reply.status(400).send({ error: 'Nenhum arquivo enviado' });
    }

    if (!data.filename.toLowerCase().endsWith('.csv')) {
      return reply.status(400).send({ error: 'Extensão de arquivo inválida. Apenas CSV é permitido.' });
    }
    
    const buffer = await data.toBuffer();
    const csvText = buffer.toString('utf8');
    const results = [];
    

    const lines = csvText.split('\n').filter(line => line.trim());
    
    for (let i = 1; i < lines.length; i++) {
      const columns = lines[i].split(',').map(col => col.trim().replace(/^"|"$/g, ''));
      
      if (columns.length >= 5) {
        const maxId = Math.max(0, ...products.map(p => parseInt(p.id) || 0));
        const newId = (maxId + results.length + 1).toString();
        
        results.push({
          id: newId,
          name: columns[0] || 'Sem nome',
          description: columns[1] || 'Sem descrição',
          price: parseFloat(columns[2]) || 0,
          category: columns[3] || 'Sem categoria',
          pictureUrl: columns[4] || 'https://picsum.photos/300/300?product',
          status: 'pending'
        });
      }
    }
    
    return {
      message: 'CSV processado com sucesso',
      products: results,
      total: results.length
    };
    
  } catch (error) {
    console.error('❌ Erro no upload CSV:', error);
    return reply.status(500).send({
      error: 'Erro ao processar arquivo CSV',
      message: error.message
    });
  }
});


fastify.post('/products/bulk', async (request, reply) => {
  try {
    const { products: productsToCreate } = request.body;
    
    if (!Array.isArray(productsToCreate)) {
      return reply.status(400).send({ error: 'Dados inválidos' });
    }
    
    const results = [];
    const maxId = Math.max(0, ...products.map(p => parseInt(p.id) || 0));
    let currentId = maxId + 1;
    
    for (const productData of productsToCreate) {
      try {
        const newProduct = {
          id: currentId.toString(),
          name: productData.name,
          description: productData.description,
          price: productData.price,
          category: productData.category,
          pictureUrl: productData.pictureUrl
        };
        
        products.push(newProduct);
        results.push({
          success: true,
          product: newProduct
        });
        
        currentId++;
        
      } catch (error) {
        results.push({
          success: false,
          error: error.message,
          product: productData
        });
      }
    }
    
    return {
      message: 'Lote de produtos processado',
      results: results,
      total: results.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success).length
    };
    
  } catch (error) {
    return reply.status(500).send({
      error: 'Erro ao processar lote de produtos',
      message: error.message
    });
  }
});


const start = async () => {
  try {

    await loadProductsFromFile();
   
    if (products.length === 0) {
      console.log('📦 Inicializando com dados padrão...');
      products = [
        {
          id: '1',
          name: 'Smartphone Samsung Galaxy S23',
          description: 'Smartphone Android com 256GB, 8GB RAM, Câmera Tripla 50MP',
          price: 2999.99,
          category: 'Eletrônicos',
          pictureUrl: 'https://picsum.photos/300/300?tech=1'
        },
        {
          id: '2',
          name: 'Notebook Dell Inspiron 15',
          description: 'Notebook Intel i7, 16GB RAM, SSD 512GB, Windows 11 Pro',
          price: 4299.99,
          category: 'Informática',
          pictureUrl: 'https://picsum.photos/300/300?computer=2'
        }
      ];
      await saveProductsToFile();
    }
    

    await fastify.listen({ 
      port: 3000,
      host: '0.0.0.0'
    });
    
    console.log('🚀 ===========================================');
    console.log('🚀 BACKEND COM PERSISTÊNCIA JSON INICIADO!');
    console.log('🚀 ===========================================');
    console.log('📦 Endpoint: http://localhost:3000');
    console.log('📦 Health:   http://localhost:3000/health');
    console.log('📦 Produtos: http://localhost:3000/products');
    console.log('💾 Arquivo:  ', PRODUCTS_FILE);
    console.log('📦 Total de produtos:', products.length);
    console.log('=============================================');
    
  } catch (err) {
    console.error('❌ Erro ao iniciar servidor:', err.message);
    
    
    try {
      await fastify.listen({ port: 3001, host: '0.0.0.0' });
      console.log('🚀 Servidor rodando em: http://localhost:3001');
    } catch (err2) {
      console.error('❌ Erro também na porta 3001:', err2.message);
      process.exit(1);
    }
  }
};

process.on('SIGINT', async () => {
  console.log('\n💾 Salvando dados antes de encerrar...');
  await saveProductsToFile();
  console.log('✅ Dados salvos. Encerrando servidor.');
  process.exit(0);
});


start();
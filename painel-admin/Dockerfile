FROM node:20-alpine

# Cria e define o diretório de trabalho
WORKDIR /app

# Copia os arquivos de dependências primeiro para aproveitar o cache do Docker
COPY package*.json ./

# Instala as dependências
RUN npm install

# Copia o restante dos arquivos da aplicação
COPY . .

# Expõe a porta que a aplicação usa
EXPOSE 3000

# Comando para iniciar a aplicação
CMD ["node", "index.js"]
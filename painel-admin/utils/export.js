import XLSX from 'xlsx';
import { loggers } from './logger.js';

/**
 * Utilitário para exportação de dados em diferentes formatos
 */
export class ExportUtils {
  
  /**
   * Exporta dados para CSV
   * @param {Array} data - Array de objetos com os dados
   * @param {Array} headers - Array com os cabeçalhos das colunas
   * @param {string} filename - Nome do arquivo
   * @param {Object} res - Response object do Express
   */
  static exportToCSV(data, headers, filename, res) {
    try {
      // Configurar cabeçalhos para download
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      
      // BOM para UTF-8 (suporte a acentos)
      res.write('\uFEFF');
      
      // Escrever cabeçalho
      res.write(headers.join(',') + '\n');
      
      // Escrever dados
      data.forEach(row => {
        const csvRow = headers.map(header => {
          const value = row[header.toLowerCase().replace(/\s+/g, '_')] || '';
          // Escapar aspas duplas e envolver em aspas se contém vírgula
          const escapedValue = String(value).replace(/"/g, '""');
          return escapedValue.includes(',') || escapedValue.includes('"') || escapedValue.includes('\n') 
            ? `"${escapedValue}"` 
            : escapedValue;
        });
        res.write(csvRow.join(',') + '\n');
      });
      
      res.end();
      
      loggers.system.info('CSV export completed', {
        filename,
        recordCount: data.length
      });
      
    } catch (error) {
      loggers.error.error('CSV export error', {
        error: error.message,
        filename,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Exporta dados para Excel
   * @param {Array} data - Array de objetos com os dados
   * @param {Array} headers - Array com os cabeçalhos das colunas
   * @param {string} filename - Nome do arquivo
   * @param {Object} res - Response object do Express
   * @param {Object} options - Opções adicionais (sheetName, etc.)
   */
  static exportToExcel(data, headers, filename, res, options = {}) {
    try {
      const { sheetName = 'Dados', includeStats = false } = options;
      
      // Criar workbook
      const workbook = XLSX.utils.book_new();
      
      // Preparar dados para o Excel
      const excelData = data.map(row => {
        const excelRow = {};
        headers.forEach(header => {
          const key = header.toLowerCase().replace(/\s+/g, '_');
          excelRow[header] = row[key] || '';
        });
        return excelRow;
      });
      
      // Criar worksheet principal
      const worksheet = XLSX.utils.json_to_sheet(excelData);
      
      // Configurar largura das colunas
      const colWidths = headers.map(header => ({
        wch: Math.max(header.length, 15)
      }));
      worksheet['!cols'] = colWidths;
      
      // Adicionar worksheet ao workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
      
      // Se incluir estatísticas, criar aba adicional
      if (includeStats && data.length > 0) {
        const stats = this.generateStats(data, headers);
        const statsWorksheet = XLSX.utils.json_to_sheet(stats);
        XLSX.utils.book_append_sheet(workbook, statsWorksheet, 'Estatísticas');
      }
      
      // Gerar buffer do Excel
      const excelBuffer = XLSX.write(workbook, { 
        type: 'buffer', 
        bookType: 'xlsx',
        compression: true
      });
      
      // Configurar cabeçalhos para download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
      res.setHeader('Content-Length', excelBuffer.length);
      
      // Enviar arquivo
      res.send(excelBuffer);
      
      loggers.system.info('Excel export completed', {
        filename,
        recordCount: data.length,
        includeStats
      });
      
    } catch (error) {
      loggers.error.error('Excel export error', {
        error: error.message,
        filename,
        stack: error.stack
      });
      throw error;
    }
  }
  
  /**
   * Gera estatísticas básicas dos dados
   * @param {Array} data - Dados para análise
   * @param {Array} headers - Cabeçalhos
   * @returns {Array} Estatísticas
   */
  static generateStats(data, headers) {
    const stats = [
      { Métrica: 'Total de Registros', Valor: data.length },
      { Métrica: 'Data de Geração', Valor: new Date().toLocaleString('pt-BR') }
    ];
    
    // Estatísticas por coluna numérica
    headers.forEach(header => {
      const key = header.toLowerCase().replace(/\s+/g, '_');
      const values = data.map(row => row[key]).filter(val => !isNaN(val) && val !== '');
      
      if (values.length > 0) {
        const numValues = values.map(Number);
        stats.push(
          { Métrica: `${header} - Soma`, Valor: numValues.reduce((a, b) => a + b, 0) },
          { Métrica: `${header} - Média`, Valor: (numValues.reduce((a, b) => a + b, 0) / numValues.length).toFixed(2) },
          { Métrica: `${header} - Máximo`, Valor: Math.max(...numValues) },
          { Métrica: `${header} - Mínimo`, Valor: Math.min(...numValues) }
        );
      }
    });
    
    return stats;
  }
  
  /**
   * Formata dados para export baseado no tipo de relatório
   * @param {string} reportType - Tipo do relatório
   * @param {Array} rawData - Dados brutos do banco
   * @returns {Object} Dados formatados e cabeçalhos
   */
  static formatDataForExport(reportType, rawData) {
    const formatters = {
      clientes: {
        headers: ['ID', 'Nome', 'Email', 'Telefone', 'Status', 'Data Cadastro'],
        formatter: (row) => ({
          id: row.id,
          nome: row.nome,
          email: row.email,
          telefone: row.telefone,
          status: row.status,
          data_cadastro: new Date(row.data_cadastro).toLocaleDateString('pt-BR')
        })
      },
      agendamentos: {
        headers: ['ID', 'Cliente', 'Quiosque', 'Data Agendamento', 'Status', 'Valor', 'Data Criação'],
        formatter: (row) => ({
          id: row.id,
          cliente: row.cliente_nome,
          quiosque: `${row.tipo_local} ${row.numero}`,
          data_agendamento: new Date(row.data_agendamento).toLocaleDateString('pt-BR'),
          status: row.status,
          valor: `R$ ${parseFloat(row.valor || 0).toFixed(2)}`,
          data_criacao: new Date(row.data_criacao).toLocaleDateString('pt-BR')
        })
      },
      pagamentos: {
        headers: ['ID', 'Cliente', 'Valor', 'Status', 'Método', 'Data Pagamento', 'Referência'],
        formatter: (row) => ({
          id: row.id,
          cliente: row.cliente_nome,
          valor: `R$ ${parseFloat(row.valor || 0).toFixed(2)}`,
          status: row.status,
          metodo: row.metodo_pagamento,
          data_pagamento: row.data_pagamento ? new Date(row.data_pagamento).toLocaleDateString('pt-BR') : '',
          referencia: row.referencia_externa
        })
      },
      campanhas: {
        headers: ['ID', 'Nome', 'Tipo', 'Status', 'Orçamento', 'Data Início', 'Data Fim'],
        formatter: (row) => ({
          id: row.id,
          nome: row.nome,
          tipo: row.tipo,
          status: row.status,
          orcamento: `R$ ${parseFloat(row.orcamento || 0).toFixed(2)}`,
          data_inicio: row.data_inicio ? new Date(row.data_inicio).toLocaleDateString('pt-BR') : '',
          data_fim: row.data_fim ? new Date(row.data_fim).toLocaleDateString('pt-BR') : ''
        })
      },
      creditos: {
        headers: ['ID', 'Cliente', 'Valor', 'Status', 'Data Criação', 'Data Vencimento', 'Motivo'],
        formatter: (row) => ({
          id: row.id,
          cliente: row.cliente_nome,
          valor: `R$ ${parseFloat(row.valor || 0).toFixed(2)}`,
          status: row.status,
          data_criacao: new Date(row.data_criacao).toLocaleDateString('pt-BR'),
          data_vencimento: row.data_vencimento ? new Date(row.data_vencimento).toLocaleDateString('pt-BR') : '',
          motivo: row.motivo
        })
      },
      fila_atendimento: {
        headers: ['ID', 'Cliente', 'Tipo Atendimento', 'Status', 'Data Entrada', 'Data Início', 'Data Fim'],
        formatter: (row) => ({
          id: row.id,
          cliente: row.cliente_nome,
          tipo_atendimento: row.tipo_atendimento,
          status: row.status,
          data_entrada: new Date(row.data_entrada).toLocaleString('pt-BR'),
          data_inicio: row.data_inicio ? new Date(row.data_inicio).toLocaleString('pt-BR') : '',
          data_fim: row.data_fim ? new Date(row.data_fim).toLocaleString('pt-BR') : ''
        })
      }
    };
    
    const config = formatters[reportType];
    if (!config) {
      throw new Error(`Tipo de relatório não suportado: ${reportType}`);
    }
    
    const formattedData = rawData.map(config.formatter);
    
    return {
      headers: config.headers,
      data: formattedData
    };
  }
}

export default ExportUtils;
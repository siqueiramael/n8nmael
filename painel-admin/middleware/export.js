import { ExportUtils } from '../utils/export.js';
import { loggers } from '../utils/logger.js';

/**
 * Middleware genérico para exportação de dados
 * @param {string} moduleName - Nome do módulo (clientes, agendamentos, etc.)
 * @param {Function} queryBuilder - Função que constrói a query SQL
 * @param {string} permission - Permissão necessária
 */
export function createExportMiddleware(moduleName, queryBuilder, permission) {
  return {
    // Export CSV
    csv: async (req, res) => {
      const startTime = Date.now();
      
      try {
        const { query, params } = queryBuilder(req.query);
        const result = await pool.query(query, params);
        
        const { headers, data } = ExportUtils.formatDataForExport(moduleName, result.rows);
        const filename = `${moduleName}_${new Date().toISOString().split('T')[0]}`;
        
        ExportUtils.exportToCSV(data, headers, filename, res);
        
        loggers.system.info(`${moduleName} CSV export`, {
          userId: req.user?.id,
          recordCount: result.rows.length,
          filters: req.query,
          duration: Date.now() - startTime
        });
        
      } catch (error) {
        loggers.error.error(`${moduleName} CSV export error`, {
          error: error.message,
          userId: req.user?.id,
          filters: req.query
        });
        res.status(500).send('Erro ao exportar dados');
      }
    },
    
    // Export Excel
    excel: async (req, res) => {
      const startTime = Date.now();
      
      try {
        const { query, params } = queryBuilder(req.query);
        const result = await pool.query(query, params);
        
        const { headers, data } = ExportUtils.formatDataForExport(moduleName, result.rows);
        const filename = `${moduleName}_${new Date().toISOString().split('T')[0]}`;
        
        ExportUtils.exportToExcel(data, headers, filename, res, {
          sheetName: moduleName.charAt(0).toUpperCase() + moduleName.slice(1),
          includeStats: true
        });
        
        loggers.system.info(`${moduleName} Excel export`, {
          userId: req.user?.id,
          recordCount: result.rows.length,
          filters: req.query,
          duration: Date.now() - startTime
        });
        
      } catch (error) {
        loggers.error.error(`${moduleName} Excel export error`, {
          error: error.message,
          userId: req.user?.id,
          filters: req.query
        });
        res.status(500).send('Erro ao exportar dados');
      }
    }
  };
}

export default createExportMiddleware;
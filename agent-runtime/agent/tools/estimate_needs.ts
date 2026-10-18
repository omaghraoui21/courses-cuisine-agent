import { defineTool } from 'eve/tools';
import { z } from 'zod';
export default defineTool({
 description: 'Calculer des besoins à partir de consommations explicitement déclarées ; ne lit ni ne modifie le stock réel.',
 inputSchema: z.object({products:z.array(z.object({name:z.string().min(1),monthlyUsage:z.number().nonnegative(),stock:z.number().nonnegative(),months:z.number().positive().max(12).default(1)})).max(100)}),
 async execute({products}) { return {basis:'declared',items:products.map(p=>({name:p.name,annual:p.monthlyUsage*12,toBuy:Math.max(0,p.monthlyUsage*p.months-p.stock)}))}; }
});

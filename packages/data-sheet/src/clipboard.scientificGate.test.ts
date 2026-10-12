import {describe,it,expect} from 'vitest';
import {parseTabularClipboard} from './clipboard';
describe('B03 first-row and numeric delimiter ambiguity',()=>{
 for(const text of ['1,234\n2,345','1,2\n2,3','A\t10\nB\t20','<0.1\n0.2','"1,234"\n"2,345"']) it('rejects ambiguous input '+text,()=>{
 const result=parseTabularClipboard(text);expect(result.parseError).toBeTruthy();expect(result.recommendedColumnIndex).toBeNull();expect(result.rows.length).toBe(2);
 });
 it('preserves named CSV and explicit TSV numeric values and positions',()=>{
 expect(parseTabularClipboard('Label,Mean\n"cell, 1",12.5').columns[1].values).toEqual([12.5]);
 expect(parseTabularClipboard('1\t234\n2\t345').columns[1].values).toEqual([234,345]);
 const censored=parseTabularClipboard('Mean\n<0.1\n0.2');expect(censored.rows[0][0]).toBe('<0.1');expect(censored.columns[0].invalidRowNumbers).toEqual([1]);
 });
});
it('rejects decimal commas that increase CSV data-row width under a text header',()=>{const p=parseTabularClipboard('Control,Treated\n1,5,2,3');expect(p.parseError).toMatch(/列数/);expect(p.rows[1]).toEqual(['1','5','2','3']);expect(p.columns).toEqual([]);});

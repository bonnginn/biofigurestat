import {it,expect} from 'vitest';
import {AnalysisEngineRequestSchema} from '@lsaa/analysis-contracts';
import {twoConditionAlternativeText,twoConditionIntervalNote,usesCentralTwoConditionTInterval} from './twoConditionInferenceText';
const base={requestId:'r',projectId:'p',analysisId:'a',templateVersion:'0.1.0',options:{alternative:'greater',confidenceLevel:.95,multiplicityMethod:null}};
it('D12 saves a directional mean hypothesis separately from central CI coverage',()=>{
 const r=AnalysisEngineRequestSchema.parse({...base,protocolVersion:'0.9.0',templateId:'D12',method:'one_sample_t',conditionId:'c',nullValue:1,observations:[2,3].map((value,i)=>({observationId:'o'+i,experimentalUnitId:'u'+i,conditionId:'c',value}))});
 const saved=AnalysisEngineRequestSchema.parse(JSON.parse(JSON.stringify(r)));expect(twoConditionAlternativeText(saved)).toContain('基準値 1：大きい');expect(usesCentralTwoConditionTInterval(saved)).toBe(true);expect(twoConditionIntervalNote(saved)).toContain('片側p値と同じ棄却境界');
});
it('D16 saves directional slope hypothesis separately from central CI coverage',()=>{
 const r=AnalysisEngineRequestSchema.parse({...base,protocolVersion:'0.13.0',templateId:'D16',method:'simple_linear_regression',xLabel:'x',yLabel:'y',xUnit:'',yUnit:'',includeIntercept:true,points:[1,2,3].map((x,i)=>({observationId:'o'+i,experimentalUnitId:'u'+i,x,y:x+i%2})),observations:[]});
 expect(twoConditionAlternativeText(r)).toContain('回帰の傾きと0：大きい');expect(twoConditionIntervalNote(r)).toContain('CIは両側');expect(twoConditionIntervalNote(r)).toContain('棄却境界');
});

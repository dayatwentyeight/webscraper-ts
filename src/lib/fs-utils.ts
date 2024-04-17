import fs from "fs-extra";
import { Rule } from "../loader";

/**
 * Returns the Rule list
 * 
 * Define rules in data/rules.json first
 * Each rule should have matching field to be used in Loader
 * 
 */
export async function getRuleList() {
  const jsonData = await fs.readFile('data/rules.json', 'utf-8');
  return JSON.parse(jsonData) as Rule[];
} 

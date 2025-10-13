type MaterialCost = {
  materialDescription: string;
  costPerSellingUnit: number;
  costPerSelling_unit: number;
};

export type Quote = {
  id: string;
  quoteName: string;
  itemName: string;
  itemDescription?: string;
  quoteDate: string; 
  committedFlag: boolean;
  supplier: { name?: string } | string;
  costing: {
    firstCost: number;
    componentMaterialCosting?: MaterialCost[];
  };
  clubCosting: { retailPrice: number };
};
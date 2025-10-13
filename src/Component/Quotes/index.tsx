import { useEffect, useMemo, useRef, useState } from 'react';
import { Table, Input, InputNumber, Button, Form, Space, Checkbox } from 'antd';
import moment from 'moment';
import { Quote } from '../../types/Quote';

const STORAGE_KEY = 'quotesData';

function fmtCurrency(n?: number) {
    if (n == null || isNaN(n)) return '';
    return n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

export default function Quotes() {
    const [form] = Form.useForm();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [unsavedMap, setUnsavedMap] = useState<Record<string, boolean>>({});
    const [drafts, setDrafts] = useState<Record<string, any>>({});
    
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if(stored) {
            try{
                const parsed = JSON.parse(stored) as Quote[];
                setQuotes(parsed);
                return;
            }catch(e){
                console.warn('Failed parsing local storage, will fetch file', e);
            }
        }

        const load = async () => {
            try{
                const resp = await fetch('/Quote Data.txt');
                if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
                const text = await resp.text();
                const json = JSON.parse(text) as Quote[];
                setQuotes(json);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(json));
            }catch (err){
                console.error('Failed loading quote data', err);
            }
        };
        load();
    }, [])

    const isEditing = (record: Quote) => record.id === editingId;

    const handleEditBtn = (record: Quote) => {
        // if another row was being edited, save its current form values as a draft
        if (editingId && editingId !== record.id) {
            const current = form.getFieldsValue();
            setDrafts((d) => ({ ...d, [editingId]: current }));
        }

        // load data from draft or actual record
        const draft = drafts[record.id];
        if (draft) {
            form.setFieldsValue(draft);
            setUnsavedMap((s) => ({ ...s, [record.id]: true }));
        } else {
            form.setFieldsValue({
                quoteDate: moment(record.quoteDate).format('YYYY-MM-DD'),
                firstCost: record.costing?.firstCost || undefined,
                retailPrice: record.clubCosting?.retailPrice || undefined,
                committedFlag: record.committedFlag ? true : false
            });
            setUnsavedMap((s) => ({ ...s, [record.id]: false }));
        }

        setEditingId(record.id);
    }

    const hanldeCancelBtn = () => {
        // discard draft
        if (editingId) {
            setDrafts((d) => {
                const copy = { ...d };
                delete copy[editingId];
                return copy;
            });
            setUnsavedMap((s) => ({ ...s, [editingId]: false }));
        }
        setEditingId(null);
        form.resetFields();
    }

    const handleSaveBtn = async (id: string) => {
        try {
            const values = await form.validateFields();
            setQuotes((prev) => {
                const next = prev.map((q) => {
                    if (q.id !== id) return q;
                    const updated: Quote = { ...q };
                    // date
                    if (typeof values.quoteDate === 'string' && values.quoteDate) {
                        const iso = moment(values.quoteDate).toISOString();
                        updated.quoteDate = iso;
                    }
                    // committed
                    updated.committedFlag = values.committedFlag ? true : false;
                    // first cost
                    if (typeof values.firstCost !== 'undefined') {
                        const v = Number(values.firstCost);
                        updated.costing = { ...(updated.costing || {}), firstCost: isNaN(v) ? updated.costing?.firstCost : v };
                    }
                    // retail
                    if (typeof values.retailPrice !== 'undefined') {
                        const v = Number(values.retailPrice);
                        updated.clubCosting = { ...(updated.clubCosting || {}), retailPrice: isNaN(v) ? updated.clubCosting?.retailPrice : v };
                    }
                    return updated;
                });
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                return next;
            });
            setEditingId(null);
            form.resetFields();
            // clear unsaved flag and clear draft after save
            setUnsavedMap((s) => ({ ...s, [id]: false }));
            setDrafts((d) => {
                const copy = { ...d };
                delete copy[id];
                return copy;
            });
        }catch(err) {
            console.warn('Validation failed:', err);
        }
    }

    // update drafts and unsaved flag when form changes for the current editing row
    const onFormValuesChange = (_changed: any, allValues: any) => {
        if (!editingId) return;
        // save draft
        setDrafts((d) => ({ ...d, [editingId]: allValues }));

        // compare to saved quotes
        const base = quotes.find((q) => q.id === editingId);
        if (!base) return;
        const baseDate = base.quoteDate ? moment(base.quoteDate).format('YYYY-MM-DD') : '';
        const baseFirst = base.costing?.firstCost;
        const baseRetail = base.clubCosting?.retailPrice;
        const baseCommitted = base.committedFlag ? true : false;

        const curDate = allValues.quoteDate || '';
        const curFirst = typeof allValues.firstCost !== 'undefined' && allValues.firstCost !== null ? Number(allValues.firstCost) : undefined;
        const curRetail = typeof allValues.retailPrice !== 'undefined' && allValues.retailPrice !== null ? Number(allValues.retailPrice) : undefined;
        const curCommitted = allValues.committedFlag ? true : false;

        const changed = (curDate !== baseDate)
            || (typeof curFirst !== 'undefined' && Number(baseFirst) !== Number(curFirst))
            || (typeof curRetail !== 'undefined' && Number(baseRetail) !== Number(curRetail))
            || (curCommitted !== baseCommitted);

        setUnsavedMap((s) => ({ ...s, [editingId]: changed }));
    }

    const renderMaterialRows = (q: Quote) => {
        const costing = q.costing as any;
        const list = costing && costing?.componentMaterialCosting ? costing.componentMaterialCosting : [];
        const materialColumns = [
          { title: 'Material', dataIndex: 'materialDescription', key: 'materialDescription' },
          {
            title: 'Cost per unit',
            dataIndex: 'cost',
            key: 'cost',
            align: 'right' as const,
            render: (val: number) => fmtCurrency(Number(val)),
            width: 160
          }
        ]

        const dataSource = list.map((m: any, idx: number) => ({
          key: idx,
          materialDescription: m.materialDescription || '-',
          cost: m.costPerSellingUnit || 0,
        }));
        return <Table size='small' columns={materialColumns} dataSource={dataSource} pagination={false}/>;
    }

    const columns = [
        { title: 'Item Name', dataIndex: 'itemName', key: 'itemName', width: 200 },
        { title: 'Item Description', dataIndex: 'itemDescription', key: 'itemDescription', ellipsis: true },
        {
            title: 'Supplier',
            dataIndex: ['supplier', 'name'],
            key: 'supplier'
        },
        {
            title: 'Quote Date',
            dataIndex: 'quoteDate',
            key: 'quoteDate',
            render: (_: any, record: Quote) => {
                return isEditing(record) ? (
                    <Form.Item name='quoteDate' style={{ margin: 0 }} rules={[{ required: false }]}>
                        <Input type='date' />
                    </Form.Item>
                ) : moment(record.quoteDate).format('YYYY-MM-DD')
            }
        },
        {
            title: 'First Cost',
            dataIndex: ['costing', 'firstCost'],
            key: 'firstCost',
            render: (_: any, record: Quote) =>{
                return isEditing(record) ? (
                    <Form.Item name='firstCost' style={{ margin: 0 }}>
                        <InputNumber step={0.01} />
                    </Form.Item>
                ) : fmtCurrency(record.costing?.firstCost)
            }
        },
        {
            title: 'Retail Price',
            dataIndex: ['clubCosting', 'retailPrice'],
            key: 'retailPrice',
            render: (_: any, record: Quote) =>{
                return isEditing(record) ? (
                    <Form.Item name='retailPrice' style={{ margin: 0 }}>
                        <InputNumber step={0.01} />
                    </Form.Item>
                ) : fmtCurrency(record.clubCosting?.retailPrice)
            }     
        },
        {
            title: 'Committed',
            dataIndex: 'committedFlag',
            key: 'committedFlag',
            align: 'center' as const,
            render: (_: any, record: Quote) =>{
                return isEditing(record) ? (
                    <Form.Item name='committedFlag' valuePropName='checked' style={{ margin: 0 }}>
                        <Checkbox />
                    </Form.Item>
                ) : record.committedFlag ? 'Yes' : 'No'
            }
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 180,
            render: (_: any, record: Quote) => {
                const editable = isEditing(record);
                return editable ? (
                    <Space>
                        <Button type='primary' onClick={() => handleSaveBtn(record.id)}>Save</Button>
                        <Button onClick={hanldeCancelBtn}>Cancel</Button>
                    </Space>
                ) : <Button onClick={() => handleEditBtn(record)}>Edit</Button>
            }
        }
    ]

    const dataSource = useMemo(() => quotes.map((q) => ({ ...q, key: q.id })), [quotes]);

    return (
        <div style={{ padding: '16px' }}>
            <h2>Quotes</h2>
            <Form form={form} component={false} onValuesChange={onFormValuesChange}>
                <Table
                dataSource={dataSource}
                columns={columns}
                bordered={true}
                rowClassName={(record: any) => (unsavedMap[record.id] ? 'unsaved-row' : '')}
                expandable={{
                    expandedRowRender: (record: any) => (
                        <div>
                            <strong>Component Material Costing</strong>
                            <div style={{ marginTop: '8px' }}>{renderMaterialRows(record)}</div>
                        </div>
                    ),
                    rowExpandable: (record: any) => {
                        const costing = (record.costing || {}) as any;
                        const list = costing && costing?.componentMaterialCosting ? costing.componentMaterialCosting : [];
                        return Array.isArray(list) && list.length > 0;
                    }
                }}
                pagination={{ pageSize: 25 }}
                />
            </Form>
        </div>
    );
}
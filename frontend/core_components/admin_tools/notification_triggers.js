// notification_triggers.js

import { loadManagementView } from '../../common_components/utils.js';
import { createVanillaDropdown } from '../../common_components/vanilla_dropdown/vanilla_dropdown.js';
import { fetch_columns_for_table } from '../endpoints/endpoint_column_fetcher.js';
import { endpoint_router } from '../endpoints/endpoint_router.js';

export async function load_trigger_management() {
  return loadManagementView('trigger_management_container', generate_notification_trigger_view);
}

/**
 * generate_trigger_creation_form:
 * Luodaan lomake, jossa:
 * 1) Valitaan lähdetaulu (dropdown + haku), sen sarake, operaattori, arvo
 * 2) Valitaan kohdetaulu (dropdown + haku)
 * 3) Lisätään n kappaletta (sarake+arvo)-paitoja
 * 4) Luodaan “Luo heräte” -painike
 */
export async function generate_notification_trigger_view(container) {
  // Haetaan kaikki taulut
  const content_tables = await fetchContentTables();

  // Luodaan <form>
  const form = createForm();

  // 1) Lähdetauludropdown + conditionContainer (sarake, operaattori, arvo)
  const sourceTableObj = createSourceTableDropdown(content_tables);
  form.appendChild(sourceTableObj.container);

  // “condition_container”: sarake + operator + value
  const conditionObj = createConditionContainer();
  form.appendChild(conditionObj.container);

  // 2) Kohdetauludropdown
  const targetTableObj = createTargetTableDropdown(content_tables);
  form.appendChild(targetTableObj.container);

  // “action_values_container”: n kpl “Kohdesarake + Kohdearvo” -rivejä
  const actionValuesContainer = createActionValuesContainer();
  form.appendChild(actionValuesContainer.container);

  // 3) Submit-painike
  const submitButton = createSubmitButton();
  form.appendChild(submitButton);

  // Lomakkeen rungon lisäys DOM:iin
  container.appendChild(form);

  // -- Alustetaan LÄHDETAULU -> Kun taulu vaihtuu, haetaan sarakkeet “conditionObj”->columnDropdown
  sourceTableObj.dropdown.setOptions(mapTablesToOptions(content_tables)); // Aluksi listataan kaikki taulut

  // -- Alustetaan KOHDETAULU
  targetTableObj.dropdown.setOptions(mapTablesToOptions(content_tables));

  // Aluksi lisätään 1 kpl actionValue-rivi
  addActionValueRow(actionValuesContainer, targetTableObj.dropdown);

  // Lähdetaulun dropdown “onChange” -> conditionObj päivitetään
  // Kohdetaulun “onChange” -> actionValue-rivit päivitetään
  // + Tapahtumankuuntelija “Lisää sarake-arvo -pari” -painikkeelle
  actionValuesContainer.add_button.addEventListener('click', () => {
    addActionValueRow(actionValuesContainer, targetTableObj.dropdown);
  });

  // + Lomakkeen submit
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await create_trigger();
  });
}

/* ------------------------------------------------------------------
   API-funktiot
------------------------------------------------------------------ */

/**
 * Hakee kaikki taulut api tables -endpointista
 */
export async function fetchContentTables() {
  try {
    // Käytetään endpoint_router:ia
    const result = await endpoint_router('fetchContentTables');
    console.log('Fetched tables:', result);

    // Käydään dynaamisesti läpi kaikki result.tables avaimet ja yhdistetään ne
    const all_tables_from_all_groups = Object.values(result.tables).flat();
    return all_tables_from_all_groups;
  } catch (err) {
    console.error('Virhe taulujen haussa:', err);
    throw new Error('Failed to fetch content tables');
  }
}

/* ------------------------------------------------------------------
   DOM-rakenteen luontifunktiot
------------------------------------------------------------------ */

function createForm() {
  const form = document.createElement('form');
  form.id = 'trigger_creation_form';
  return form;
}

/**
 * createSourceTableDropdown:
 *  - Sisältää pienen label + p -kuvauksen + container, johon luodaan vanilla_dropdown (haulla).
 */
function createSourceTableDropdown() {
  const container = document.createElement('div');

  const label = document.createElement('label');
  label.textContent = 'Lähdetaulu:';
  container.appendChild(label);

  const description = document.createElement('p');
  description.textContent = 'Kun lähdetauluun lisätään tietty arvo, kohdetauluun luodaan automaattisesti haluttu rivi.';
  container.appendChild(description);

  // Vanilla-dropdownin container
  const dropdownContainer = document.createElement('div');
  dropdownContainer.id = 'source_table_dropdown_container';
  container.appendChild(dropdownContainer);

  // Luodaan varsinainen dropdown
  const dropdown = createVanillaDropdown({
    containerElement: dropdownContainer,
    options: [],
    placeholder: "Valitse lähdetaulu...",
    searchPlaceholder: "Hae taulua...",
    useSearch: true,
    onChange: async (selectedTableName) => {
      console.log("Lähdetaulu vaihtui:", selectedTableName);
      if (selectedTableName) {
        const columns = await fetch_columns_for_table(selectedTableName);
        updateColumnsAndOperators(columns);
      } else {
        updateColumnsAndOperators([]);
      }
    }
  });

  async function updateColumnsAndOperators(columns) {
    const conditionContainerEl = document.getElementById('condition_container');
    if (!conditionContainerEl) return;

    const condObj = conditionContainerEl.__conditionObj;
    if (!condObj) return;

    const validCols = columns.filter(col => !shouldExcludeColumn(col));
    const colOptions = validCols.map(col => ({
      value: col.column_name,
      label: col.column_name,
      dataType: col.data_type
    }));

    condObj.columnDropdown.setOptions(colOptions);
  }

  return {
    container,
    dropdown
  };
}

/**
 * createConditionContainer:
 *  - Sarake (vanilla_dropdown)
 *  - Operaattori (vanilla_dropdown)
 *  - Arvo (input type=??)
 */
function createConditionContainer() {
  const container = document.createElement('div');
  container.id = 'condition_container';

  // Sarakevalinta
  const columnLabel = document.createElement('label');
  columnLabel.textContent = 'Lähdesarake:';
  container.appendChild(columnLabel);

  const columnDropdownContainer = document.createElement('div');
  container.appendChild(columnDropdownContainer);

  const columnDropdown = createVanillaDropdown({
    containerElement: columnDropdownContainer,
    options: [],
    placeholder: "Valitse sarake...",
    useSearch: true,
    onChange: () => {
      updateOperators();
    }
  });

  // Operaattorivalinta
  const operatorLabel = document.createElement('label');
  operatorLabel.textContent = 'Lähdearvon operaattori:';
  container.appendChild(operatorLabel);

  const operatorDropdownContainer = document.createElement('div');
  container.appendChild(operatorDropdownContainer);

  const operatorDropdown = createVanillaDropdown({
    containerElement: operatorDropdownContainer,
    options: [],
    placeholder: "Valitse operaattori...",
    useSearch: false,
    onChange: () => {
      console.log("Operator changed");
    }
  });

  // Arvo-input
  const valueLabel = document.createElement('label');
  valueLabel.textContent = 'Lähdearvo:';
  container.appendChild(valueLabel);

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.id = 'value_input';
  valueLabel.appendChild(valueInput);

  function updateOperators() {
    const colVal = columnDropdown.getValue();
    if (!colVal) return;

    const colObj = columnDropdown.__options?.find(o => o.value === colVal);
    const data_type = colObj?.dataType || 'text';

    let operators = [];
    if (['integer', 'numeric', 'double_precision', 'real', 'smallint', 'bigint'].includes(data_type)) {
      operators = ['=', '!=', '>', '<', '>=', '<='];
      valueInput.type = 'number';
    } else if (['character_varying', 'text', 'varchar'].includes(data_type)) {
      operators = ['=', '!=', 'ILIKE', 'NOT ILIKE'];
      valueInput.type = 'text';
    } else if (['boolean'].includes(data_type)) {
      operators = ['='];
      valueInput.type = 'checkbox';
    } else {
      operators = ['='];
      valueInput.type = 'text';
    }

    const operatorOpts = operators.map(op => ({ value: op, label: op }));
    operatorDropdown.setOptions(operatorOpts);
  }

  container.__conditionObj = {
    container,
    columnDropdown,
    operatorDropdown,
    valueInput
  };

  return container.__conditionObj;
}

/**
 * createTargetTableDropdown
 */
function createTargetTableDropdown() {
  const container = document.createElement('div');

  const label = document.createElement('label');
  label.textContent = 'Kohdetaulu:';
  container.appendChild(label);

  const dropdownContainer = document.createElement('div');
  dropdownContainer.id = 'target_table_dropdown_container';
  container.appendChild(dropdownContainer);

  const dropdown = createVanillaDropdown({
    containerElement: dropdownContainer,
    options: [],
    placeholder: "Valitse kohdetaulu...",
    searchPlaceholder: "Hae taulua...",
    useSearch: true,
    onChange: async (selectedTableName) => {
      console.log("Kohdetaulu vaihtui:", selectedTableName);
      const actionValuesEl = document.getElementById('action_values_container');
      if (!actionValuesEl) return;
      await updateAllActionColumns(actionValuesEl, dropdown);
    }
  });

  return {
    container,
    dropdown
  };
}

function createActionValuesContainer() {
  const container = document.createElement('div');
  container.id = 'action_values_container';

  const label = document.createElement('label');
  label.textContent = 'Toiminnon arvot:';
  container.appendChild(label);

  const list = document.createElement('div');
  list.id = 'action_values_list';
  container.appendChild(list);

  const add_button = document.createElement('button');
  add_button.type = 'button';
  add_button.textContent = 'Lisää sarake-arvo -pari';
  container.appendChild(add_button);

  return {
    container,
    list,
    add_button
  };
}

function createSubmitButton() {
  const submit_button = document.createElement('button');
  submit_button.type = 'submit';
  submit_button.textContent = 'Luo heräte';
  return submit_button;
}

/* ------------------------------------------------------------------
   Action Values -rivien hallintafunktiot
------------------------------------------------------------------ */

async function addActionValueRow(action_values_container, target_table_dropdown) {
  const action_value_row = document.createElement('div');
  action_value_row.classList.add('action_value_row');

  // Sarakevalinta
  const column_label = document.createElement('label');
  column_label.textContent = 'Kohdesarake: ';
  action_value_row.appendChild(column_label);

  const columnDropdownContainer = document.createElement('div');
  columnDropdownContainer.classList.add('action_column_dropdown_container');
  action_value_row.appendChild(columnDropdownContainer);

  const columnDropdown = createVanillaDropdown({
    containerElement: columnDropdownContainer,
    options: [],
    placeholder: "Valitse sarake...",
    useSearch: false
  });
  columnDropdownContainer.__dropdown = columnDropdown;

  const value_label = document.createElement('label');
  value_label.textContent = 'Kohdearvo: ';
  const value_input = document.createElement('input');
  value_input.type = 'text';
  value_input.classList.add('action_value_input');
  value_label.appendChild(value_input);
  action_value_row.appendChild(value_label);

  const remove_button = document.createElement('button');
  remove_button.type = 'button';
  remove_button.textContent = 'Poista';
  remove_button.addEventListener('click', () => {
    action_value_row.remove();
  });
  action_value_row.appendChild(remove_button);

  action_values_container.list.appendChild(action_value_row);

  const selectedTargetTable = target_table_dropdown.getValue();
  if (selectedTargetTable) {
    await updateActionColumns(columnDropdown, selectedTargetTable);
  }
}

async function updateActionColumns(columnDropdown, tableName) {
  if (!tableName) return;
  const columns = await fetch_columns_for_table(tableName);
  const validCols = columns.filter(col => !shouldExcludeColumn(col));
  const dropdownOptions = validCols.map(col => ({
    value: col.column_name,
    label: col.column_name
  }));
  columnDropdown.setOptions(dropdownOptions);
}

async function updateAllActionColumns(action_values_container, target_table_dropdown) {
  const selectedTable = target_table_dropdown.getValue();
  if (!selectedTable) return;

  const containers = action_values_container.querySelectorAll('.action_column_dropdown_container');
  for (const c of containers) {
    if (c.__dropdown) {
      await updateActionColumns(c.__dropdown, selectedTable);
    }
  }
}

/* ------------------------------------------------------------------
   Yleishyödylliset
------------------------------------------------------------------ */
function shouldExcludeColumn(col) {
  if (col.column_default && col.column_default.startsWith('nextval(')) {
    return true;
  }
  if (col.is_identity === 'YES') {
    return true;
  }
  if (col.computed_definition) {
    return true;
  }
  return false;
}

function mapTablesToOptions(content_tables) {
  return content_tables.map(t => ({
    value: t.table_name,
    label: t.table_name
  }));
}

/* ------------------------------------------------------------------
   Trigger-luontilogiikka
------------------------------------------------------------------ */

async function create_trigger() {
  const data = getFormData();
  console.log("create_trigger data:", data);

  try {
    // Uusi luonti-endpoint: /api/system_triggers/create
    const response = await fetch('/api/system_triggers/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    if (response.ok) {
      alert("Heräte luotu onnistuneesti!");
    } else {
      const errData = await response.json();
      alert(`Virhe herätettä luodessa: ${errData.message || 'Tuntematon virhe'}`);
    }
  } catch (err) {
    console.error("Virhe herätettä luodessa:", err);
    alert("Virhe herätettä luodessa.");
  }
}

function getFormData() {
  const sourceTableDd = document.getElementById('source_table_dropdown_container');
  let source_table = null;
  if (sourceTableDd && sourceTableDd.__dropdown) {
    source_table = sourceTableDd.__dropdown.getValue();
  }

  const condEl = document.getElementById('condition_container');
  let column = null;
  let operator = null;
  let value = null;
  if (condEl && condEl.__conditionObj) {
    column = condEl.__conditionObj.columnDropdown.getValue();
    operator = condEl.__conditionObj.operatorDropdown.getValue();
    const valInput = condEl.__conditionObj.valueInput;
    if (valInput.type === 'checkbox') {
      value = valInput.checked;
    } else {
      value = valInput.value;
    }
  }

  const condition = buildCondition(column, operator, value, condEl?.__conditionObj?.valueInput?.type);

  const targetTableDd = document.getElementById('target_table_dropdown_container');
  let target_table = null;
  if (targetTableDd && targetTableDd.__dropdown) {
    target_table = targetTableDd.__dropdown.getValue();
  }

  const action_values = collectActionValues();

  return {
    source_table,
    condition,
    target_table,
    action_values: JSON.stringify(action_values)
  };
}

function buildCondition(column, operator, value, value_type) {
  if (!column || !operator) return "";
  if (value_type === 'checkbox') {
    return `${column} ${operator} ${value}`;
  } else if (value_type === 'text' || value_type === 'number') {
    if (value_type === 'text') {
      return `${column} ${operator} '${value}'`;
    } else {
      return `${column} ${operator} ${value}`;
    }
  }
  return `${column} ${operator} '${value}'`;
}

function collectActionValues() {
  const result = {};
  const rows = document.querySelectorAll('.action_value_row');
  rows.forEach(row => {
    const colContainer = row.querySelector('.action_column_dropdown_container');
    const valInput = row.querySelector('.action_value_input');
    if (colContainer && colContainer.__dropdown) {
      const colName = colContainer.__dropdown.getValue();
      if (colName) {
        result[colName] = valInput.value;
      }
    }
  });
  result["creation_spec"] = "trigger";
  return result;
}

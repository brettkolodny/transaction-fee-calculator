import React, { useEffect, useState } from "react";
import {
  Grid,
  Form,
  Dropdown,
  Input,
  Label,
  Button,
  Icon,
} from "semantic-ui-react";

import { useSubstrate } from "./substrate-lib";
import { TxButton, TxGroupButton } from "./substrate-lib/components";

const argIsOptional = (arg) => arg.type.toString().startsWith("Option<");

function Main(props) {
  const { api, jsonrpc } = useSubstrate();
  const { accountPair } = props;
  const [status, setStatus] = useState(null);

  const [palletRPCs, setPalletRPCs] = useState([]);
  const [callables, setCallables] = useState([]);
  const [paramFields, setParamFields] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [transactionStatus, setTransactionStatus] = useState(null);

  const initFormState = {
    palletRpc: "",
    callable: "",
    inputParams: [],
  };

  const [formState, setFormState] = useState(initFormState);
  const { palletRpc, callable, inputParams } = formState;

  const updatePalletRPCs = () => {
    if (!api) {
      return;
    }
    const apiType = api.tx;
    const palletRPCs = Object.keys(apiType)
      .sort()
      .filter((pr) => Object.keys(apiType[pr]).length > 0)
      .map((pr) => ({ key: pr, value: pr, text: pr }));
    setPalletRPCs(palletRPCs);
  };

  const onClick = () => {
    console.log(palletRpc, callable, inputParams);
  };

  const updateCallables = () => {
    if (!api || palletRpc === "") {
      return;
    }
    const callables = Object.keys(api.tx[palletRpc])
      .sort()
      .map((c) => ({ key: c, value: c, text: c }));
    setCallables(callables);
  };

  const updateParamFields = () => {
    if (!api || palletRpc === "" || callable === "") {
      setParamFields([]);
      return;
    }

    let paramFields = [];

    const metaArgs = api.tx[palletRpc][callable].meta.args;

    if (metaArgs && metaArgs.length > 0) {
      paramFields = metaArgs.map((arg) => ({
        name: arg.name.toString(),
        type: arg.type.toString(),
        optional: argIsOptional(arg),
      }));
    }

    setParamFields(paramFields);
  };

  useEffect(updatePalletRPCs, [api]);
  useEffect(updateCallables, [api, palletRpc]);
  useEffect(updateParamFields, [api, palletRpc, callable]);

  const onPalletCallableParamChange = (_, data) => {
    setFormState((formState) => {
      let res;
      const { state, value } = data;
      if (typeof state === "object") {
        // Input parameter updated
        const {
          ind,
          paramField: { type },
        } = state;
        const inputParams = [...formState.inputParams];
        inputParams[ind] = { type, value };
        res = { ...formState, inputParams };
      } else if (state === "palletRpc") {
        res = { ...formState, [state]: value, callable: "", inputParams: [] };
      } else if (state === "callable") {
        res = { ...formState, [state]: value, inputParams: [] };
      }
      return res;
    });
  };

  const getOptionalMsg = (interxType) =>
    interxType === "RPC"
      ? "Optional Parameter"
      : "Leaving this field as blank will submit a NONE value";

  async function getEstimate() {
    if (!palletRpc || !callable) {
      return;
    }

    const params = inputParams.map((value) => value.value);
    const numParamsNeeded = api.tx[palletRpc][callable].meta.args.length;

    if (params.length != numParamsNeeded) {
      return;
    }

    const transaction = await api.tx[palletRpc][callable](...params);
    const hex = transaction.toHex();

    const data = { tx: hex };

    const resp = await fetch("/transaction/fee-estimate", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json",
      },
    });

    const respJSON = await resp.json();

    if (respJSON.partialFee) {
      setEstimate(respJSON.partialFee);
    }
  }

  async function submitTx() {
    if (!palletRpc || !callable) {
      return;
    }

    const params = inputParams.map((value) => value.value);
    const numParamsNeeded = api.tx[palletRpc][callable].meta.args.length;

    if (params.length != numParamsNeeded) {
      return;
    }

    const unsub = await api.tx[palletRpc][callable](...params).signAndSend(
      accountPair,
      (result) => {
        if (result.dispatchError) {
          setTransactionStatus(
            "There was an error submitting the transaction."
          );
          unsub();
        } else if (result.status.isInBlock) {
          setTransactionStatus(
            `Transaction included at blockHash ${result.status.asInBlock}`
          );
        } else if (result.status.isFinalized) {
          setTransactionStatus(
            `Transaction finalized at blockHash ${result.status.asFinalized}`
          );
          unsub();
        }
      }
    );
  }

  return (
    <Grid.Column width={8}>
      <h1>Extrinsics</h1>
      <Form>
        <Form.Field>
          <Dropdown
            placeholder="Pallets / RPC"
            fluid
            label="Pallet / RPC"
            onChange={onPalletCallableParamChange}
            search
            selection
            state="palletRpc"
            value={palletRpc}
            options={palletRPCs}
          />
        </Form.Field>
        <Form.Field>
          <Dropdown
            placeholder="Callables"
            fluid
            label="Callable"
            onChange={onPalletCallableParamChange}
            search
            selection
            state="callable"
            value={callable}
            options={callables}
          />
        </Form.Field>
        {paramFields.map((paramField, ind) => (
          <Form.Field key={`${paramField.name}-${paramField.type}`}>
            <Input
              placeholder={paramField.type}
              fluid
              type="text"
              label={paramField.name}
              state={{ ind, paramField }}
              value={inputParams[ind] ? inputParams[ind].value : ""}
              onChange={onPalletCallableParamChange}
            />
            {paramField.optional ? (
              <Label
                basic
                pointing
                color="teal"
                content={getOptionalMsg(interxType)}
              />
            ) : null}
          </Form.Field>
        ))}
        <Button onClick={getEstimate}>Estimate Fee</Button>
        {estimate ? (
          <Label basic color="teal">
            <Icon name="hand point right" />
            {estimate}
          </Label>
        ) : (
          <div></div>
        )}
        <Form.Field style={{ textAlign: "center" }}>
          <Button primary onClick={submitTx}>
            Submit
          </Button>
        </Form.Field>
        <div style={{ overflowWrap: "break-word" }}>{transactionStatus}</div>
      </Form>
    </Grid.Column>
  );
}

export default function TransactionEst(props) {
  const { api } = useSubstrate();
  return api.tx ? <Main {...props} /> : null;
}

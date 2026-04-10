# MAYAName Guide

## Summary

MAYANames are MAYAChain's vanity address system that allows affiliates to collect fees and track their user's transactions. MAYANames exist on the MAYAChain L1, so you will need a MAYAChain address and $CACAO to create and manage a MAYAName.

MAYANames have the following properties:

- **Name:** The MAYAName's string. Between 1-30 hexadecimal characters and `-_+` special characters.
- **Owner**: This is the MAYAChain address that owns the MAYAName
- **Aliases**: MAYANames can have an alias address for any external chain supported by MAYAChain, and can have an alias for the MAYAChain L1 that is different than the owner.
- **Expiry:** MAYAChain Block-height at which the MAYAName expires.
- **Preferred Asset:** The asset to pay out affiliate fees in. This can be any asset supported by MAYAChain.
- **Affiliate Basis Points:** The default fee percentage (in basis points) charged when the MAYAName is specified as an affiliate during swaps or when adding liquidity.
- **Subaffiliates:** MAYANames can have subaffiliates for revenue sharing. Each subaffiliate has an associated fee share percentage (in basis points).

## Create a MAYAName

MAYANames are created by posting a `MsgDeposit` to the MAYAChain network with the appropriate [memo](https://gitlab.com/mayachain/docs/one-stop-shop/-/blob/main/mayachain-dev-docs/introduction/broken-reference/README.md) and enough $CACAO to cover the registration fee and to pay for the amount of blocks the MAYAName should be registered for.

- **Registration fee**: `TNSREGISTERFEE` on the [Mimir endpoint](https://mayanode.mayachain.info/mayachain/mimir). This value is in 1e10, so `10000000000 = 1 $CACAO`
- **Per block fee**: `tns_fee_per_block_rune` on the same endpoint, also in 1e10.

For example, for a new MAYAName to be registered for 10 years the amount paid would be:

`amt = TNSREGISTERFEE + TNSFEEPERBLOCK * 10 * 5256000`

`5256000 = avg # of blocks per year`

The expiration of the MAYAName will automatically be set to the number of blocks in the future that was paid for minus the registration fee.

**Memo Format**

The accepted memo template is:

`~:name:?chain:?address:?owner:?preferredAsset:?expiry:?affialiateBps:?subaffiliate[/subaffiliate2...]:?subaffiliateBps[/subaffiliateBps2...]`

**Memo Parameters:**

- **name**: Your MAYAName. Must be unique, between 1-30 characters, hexadecimal and `-_+` special characters.
- **chain:** (Optional) The chain of the alias to set. If MAYAName already exists, `chain` is optional.
- **address**: (Optional) The alias address. Must be an address of chain. If MAYAName already exists, `address` is optional.
- **owner**: (Optional) MAYAChain address of owner.
- **preferredAsset:** (Optional) Asset to receive fees in. Must be supported by an active pool on MAYAChain. Value should be `asset` property from the [Pools endpoint](https://mayanode.mayachain.info/mayachain/pools). If MAYA.CACAO is set as the preferred asset, affiliate fees will be sent directly to the MAYA alias as if the preferred asset was not set.
- **expiry:** (Optional) The expiration block height for the MAYAName.
- **affiliateBps:** (Optional) Default affiliate basis points (fee percentage) used when the MAYAName is specified as an affiliate during swaps or when adding liquidity. Value is in basis points (e.g., 200 for 2%). The maximum value is 200.
- **subaffiliate:** (Optional) Subaffiliate MAYAName for revenue sharing. You can provide more "/" separated subaffiliates. The number of subaffiliates must be equal to the number of subaffiliateBps provided in next parameter.
- **subaffiliateBps:** (Optional) Basis points for the subaffiliate's fee share (e.g., 2000 for 20%). You can provide more "/" separated subaffiliateBps. The number of subaffiliateBps must be equal to the number of subaffiliates provided in the previous parameter.

{% hint style="info" %}
Example: `~:AALUXX:BTC:bc1Address:mayaAddress:BTC.BTC`
{% endhint %}

This will register a new MAYAName called AALUXX with a Bitcoin alias of `bc1Address` owner of `mayaAddress` and preferred asset of BTC.BTC.

{% hint style="info" %}
Example: `~:AALUXX2:MAYA:maya1address::THOR.RUNE::50`
{% endhint %}

This will register a new MAYAName called AALUXX2 with a MayaChain alias of `maya1Address`, a preferred asset of `THOR.RUNE`, and an Affiliate Basis Points value of `50`(0.5% affiliate fee).

{% hint style="info" %}
Example: `~:AALUXX3:BTC:bc1Address:::::SUBA:2000`
{% endhint %}

This will register a new MAYAName called AALUXX3 with a Bitcoin alias of `bc1Address` and a subaffiliate called `SUBA` with a fee share of 2000 basis points (20%). If the MAYAName AALUXX3 already exists, it will simply set the Bitcoin alias and add the `SUBA` subaffiliate to the existing MAYAName.

{% hint style="info" %}
Example: `~:AALUXX4:BTC:bc1Address:::::SUBA:0`
{% endhint %}

If the MAYAName AALUXX4 exists, this will change the Bitcoin alias to `bc1Address` and remove the `SUBA` subaffiliate from the subaffiliate list of AALUXX4. If AALUXX4 doesn't exist, it will register a new MAYAName called AALUXX4 with a Bitcoin alias of `bc1Address`. Since the newly registered MAYAName does not have the `SUBA` subaffiliate, this part of the memo will have no effect.

{% hint style="info" %}
Example: `~:AALUXX4:MAYA:maya1address::THOR.RUNE::500:SUBA:2000`
{% endhint %}

This will register or change AALUXX4's MayaChain alias to`maya1Address`, preferred asset to `THOR.RUNE`, default affiliate basis points to 500 (5%) and adds SUBA as a subaffiliate with a fee share of 2000 basis points (20%).

{% hint style="info" %}
Example: `~:AALUXX4::::::100:SUBA1/SUBA2:2000/3000`
{% endhint %}

This will add `SUBA1` and `SUBA2` as subaffiliates with fee shares of `2000` and `3000` respectively (`20%` and `30%`) for existing `AALUXX4` MAYAName.

{% hint style="info" %}
You can use [Asgardex](https://github.com/asgardex/asgardex-desktop/) to post a MsgDeposit with a custom memo. Load your wallet, then open your MAYAChain wallet page > Deposit > Custom.
{% endhint %}

{% hint style="info" %}
View your MAYAName's configuration at the MAYAName endpoint:

e.g. [https://mayanode.mayachain.info/mayachain/mayaname/](https://mayanode.mayachain.info/mayachain/mayaname/gima){name}
{% endhint %}

## Renewing your MAYAName

All MAYAName's have a expiration represented by a MAYAChain block-height. Once the expiration block-height has passed, another MAYAChain address can claim the MAYAName and any associated balance in the Affiliate Fee Collector Module (Read [#preferred-asset-for-affiliate-fees](#preferred-asset-for-affiliate-fees "mention")), so it's important to monitor this and renew your MAYAName as needed.

To keep your MAYAName registered you can extend the registration period (move back the expiration block height), by posting a `MsgDeposit` with the correct MAYAName memo and $CACAO amount.

**Memo:**

`~:AALUXX:MAYA:<maya-alias-address>`

_(Chain and alias address are required, so just use current values to keep alias unchanged)_

**$CACAO Amount:**

`cacao_amt = num_blocks_to_extend * tns_fee_per_block`

_(Remember this value will be in 1e10, so adjust accordingly for your transaction)_

## Preferred Asset for Affiliate Fees

Starting in MAYANode V112, affiliates can collect their fees in the asset of their choice (choosing from the assets that have a pool on MAYAChain). In order to collect fees in a preferred asset, affiliates must use a MAYAName in their swap memos.

#### How it Works

If an affiliate'sMAYAName has the proper preferred asset configuration set, the network will begin collecting their affiliate fees in $CACAO in the [AffiliateCollector module](https://thornode.ninerealms.com/thorchain/balance/module/affiliate_collector). Once the accrued CACAO in the module is greater than [`PreferredAssetOutboundFeeMultiplier`](https://gitlab.com/thorchain/thornode/-/blob/develop/constants/constants_v1.go#L107)`* outbound_fee` of the preferred asset's chain, the network initiates a swap from $CACAO -> Preferred Asset on behalf of the affiliate. At the time of writing, `PreferredAssetOutboundFeeMultiplier` is set to `100`, so the preferred asset swap happens when the outbound fee is 1% of the accrued $CACAO.

**Configuring a Preferred Asset for a MAYAName**

1. Register your MAYAName following instructions above.
2. Set your preferred asset's chain alias (the address you'll be paid out to), and your preferred asset. _Note: your preferred asset must be currently supported by MAYAChain._

For example, if you wanted to be paid out in USDC you would:

1. Grab the full USDC name from the [Pools ](https://mayanode.mayachain.info/mayachain/pools)endpoint: `ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48`
2. Post a `MsgDeposit` to the MAYAChain network with the appropriate memo to register your MAYAName, set your preferred asset as USDC, and set your Ethereum network address alias. Assuming the following info:
   1. MAYAChain address: `maya1g8dzs4ywxhf8hynaddw4mhwzlwzjfccakkfch7`
   2. MAYAName: `wr`
   3. ETH payout address: `0x6621d872f17109d6601c49edba526ebcfd332d5d`

   The full memo would look like:

{% code overflow="wrap" %}

```
~:wr:ETH:0x6621d872f17109d6601c49edba526ebcfd332d5d:maya1g8dzs4ywxhf8hynaddw4mhwzlwzjfccakkfch7:ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48
```

{% endcode %}

{% hint style="info" %}
You can use [Asgardex](https://github.com/asgardex/asgardex-desktop/) to post a MsgDeposit with a custom memo. Load your wallet, then open your MAYAChain wallet page > Deposit > Custom.
{% endhint %}

{% hint style="info" %}
You will also need a MAYA alias set to collect affiliate fees. Use another MsgDeposit with memo: `~:wr:MAYA:<mayachain-address>` to set your MAYA alias. Your MAYA alias address can be the same as your owner address, but won't be used for anything if a preferred asset is set.
{% endhint %}

{% hint style="info" %}
You can also set one or more subaffiliates to share revenue from affiliate fees. Use another MsgDeposits with memos:

`~:wr:500:SUBA1:2000`

`~:wr:500:SUBA2:1000`
{% endhint %}

{% hint style="info" %}
If MAYA.CACAO is set as the preferred asset, the affiliate fees are not accumulating in the affiliate collector, instead they are sent directly to the MAYA alias address on every swap. If MAYA alias is not set in MAYAName, MAYANAme Owner address is used.
{% endhint %}

Once you successfully post your MsgDeposit you can verify that your MAYAName is configured properly. View your MAYAName info from MAYANode at the following endpoint:\
<https://mayanode.mayachain.info/mayachain/mayaname/wr>

The response should look like:

```
{
  "name": "wr",
  "expire_block_height": 22061405,
  "owner": "maya1g8dzs4ywxhf8hynaddw4mhwzlwzjfccakkfch7",
  "preferred_asset": "ETH.USDC-0XA0B86991C6218B36C1D19D4A2E9EB0CE3606EB48",
  "affiliate_collector_cacao": "0",
  "aliases": [
    {
      "address": "0x6621d872f17109d6601c49edba526ebcfd332d5d",
      "chain": "ETH"
    },
    {
      "address": "maya1v7gqc98d7d2sugsw5p4pshv0mm24mfmzgmj64n",
      "chain": "MAYA"
    }
  ],
  "affiliate_bps": 150
  "subaffiliates": [
    {
      "name": "SUBA1",
      "bps": 2000
    },
    {
      "name": "SUBA2",
      "bps": 1000
    }
  ]
}
```

Your MAYAName is now properly configured and any affiliate fees will begin accruing in the AffiliateCollector module. You can verify that fees are being collected by checking the `affiliate_collector_cacao` value of the above endpoint.

## Multiple Affiliates and Subaffiliates

Affiliates can specify subaffiliates to share revenue from affiliate fees. This allows for nested affiliate relationships and revenue sharing models.

{% hint style="warning" %}
Multiple Affiliates and Subaffiliates are effective only for swaps. Subaffiliates are not considered when adding or removing liquidity.
{% endhint %}

**Calculating Affiliate Fee Shares**

The affiliate fee is split among the affiliate and its subaffiliates based on their specified basis points.

In case of swap affiliate shares fees are recursively calculated for each affiliate and its nested subaffiliates, ensuring the total does not exceed 100% of the affiliate fee.

Let's take the folowing example:

The `cat` affiliate MAYAName operates with a 1.5% fee. From this, `fox` MAYAName receives 30% and `pig` MAYAName gets 20%. Additionally, `fox` passes 40% of its share to its sub-sub-affiliate MAYName, `frog`.

Resulting distribution:

- cat: 0.75%
- fox: 0.27% (60% of 30% of 1.5%)
- pig: 0.3% (20% of 1.5%)
- frog: 0.18% (40% of 30% of 1.5%).

Here are the MsgDeposit memos used in this example:

```yaml
# create cat MAYAName with ETH.ETH as the preferred asset and 1.5 bps affiliate fee
~:cat:MAYA:<addr_maya_cat>
~:cat:ETH:<addr_eth_cat>::ETH.ETH
~:cat:150
# create fox MAYAName with ETH.ETH as the preferred
~:fox:ETH:<addr_eth_fox>::ETH.ETH
~:fox:MAYA:<addr_maya_fox>
# create pig MAYAName with ETH.ETH as the preferred
~:pig:ETH:{{ addr_eth_pig }}::ETH.ETH
# create frog MAYAName with ETH.ETH as the preferred
~:frog:ETH:{{ addr_eth_frog }}::ETH.ETH
# Set affiliate->subaffiliate relations
# set fox as cat's affiliate with 30% fee share
~:cat::fox:3000
# set pig as cat's affiliate with 20% fee share
~:cat::pig:2000
# set frog as fox's affiliate with 40% fee share (of fox's share)
~:fox::frog:4000
```

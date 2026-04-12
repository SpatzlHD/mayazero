# Pooled MAYANodes

## Summary

Skilled Node Operators who don't individually have enough Liquidity Units (Asset + CACAO) to run a node themselves can use the Bond Provider feature to collect bond from other Liquidity Providers.

Node Operators can define up to **8 Maya addresses** as Bond Providers. These addresses will be able to bond and unbond to the node, earning rewards proportional to the amount of bond they contribute. Node Operators define an operator fee in basis points, which defaults to zero and must be set explicitly when bond providers are added. The Node Operator fee is taken from rewards and paid directly to the Node Operator address after each churn.

### Rationale

The minimum Value of Liquidity Units needed to churn in as a MAYANode can be pricy (currently above $100k).

Not many people in the world have both the technical skills to run a validator AND at least $100k, which limits the supply of Node Operators who secure MAYAChain.

Pooled MAYANodes provide a way for a skilled Operator to enter a trusted agreement with Bond Providers to bootstrap enough capital for running a MAYANode. The Network's security increases, and Liquidity Providers can earn more yield.

### Economic Security

At first glance it might seem Pooled Validators contradict the economic security model of MAYAChain (i.e. that Node Operators put up more in value in slash-able bond than the assets they secure). With Pooled Validators it is possible for the Node Operator to individually put up less bond than the value of the assets that the node secures. However this nuance only exists within the relationship between the Node Operator and the Bond Providers. The Network only considers the MAYANode as single entity thus the economic model is intact.

{% hint style="warning" %}
It would be disastrous to MAYAChain if operators could collect unlimited bond quantities from anon/retail providers. Malicious Operators could start marketing campaigns collecting liquidity and then rug-pull their users, or worse, access economies of scale and take over the network.

This is why Pooled MAYANodes are invite-only and limited to 8 per node. It is difficult to access economies of scale in these small quantities.
{% endhint %}

## Managing a Pooled MAYANode

{% hint style="info" %}
All CACAO `Amount` values are in 1e10 decimals, e.g. 1 CACAO = 10000000000.
{% endhint %}

### Node Operator

#### Adding a Bond Provider

Add a bond provider using a BOND transaction with a modified memo from a wallet you control (APP or mayacli):

`BOND:<NodeAddress>:<BondProviderAddress>:<NodeOperatorFee>`

**Example:** BOND:maya7djftrgu98z84hef6dt6ykhe7cmjf3f8dcpkfun:maya9diy4q8u50qzsznpvh02s8j483aga63cl02k6jt:2000

- NodeAddress - MAYANode address (prefixed by `maya`)
- BondProviderAddress - Bond Provider address to whitelist (prefixed by `maya`)
- NodeOperatorFee - fee in basis points to be taken from rewards and paid directly to Node Operator's address after each churn.
- CACAO TX Value - 2 minimum (anything over 1 is added to the Operator's Bond).

_A Node Operator is the first on-chain bonding transaction to a new node. You cannot change the operator address after the fact._

_The Operator is also added as a Bond Provider._

**Removing a Bond Provider**

While the node is churned out, A Node Operator can remove a Bond Provider using an UNBOND transaction with a modified memo:

`UNBOND:<NodeAddress>:<Amount>:<BondProviderAddress>`

- NodeAddress - MAYANode address (prefixed by `maya`)
- Amount - amount of Bond Provider's bond to refund
- BondProviderAddress - Bond Provider address to refund/remove (prefixed by `maya`)
- RUNE Tx Value - 1 minimum

_This command will refund the Bond Provider their bond and remove them from the Bond Provider list only if `Amount` constitutes all of the bond the Bond Provider is owed._

#### Node Operator Fee

Node operators can set a fee that is paid to them from the earnings each churn.

To set a Node Operator fee, send a deposit transaction with the following memo:

`BOND:<node address>:<bond wallet address>:<operator fee in basis pts>`

Example: `BOND:maya1agftrgu74z84hef6dt6ykhe7cmjf3f8dcpkfun:maya1tfm4q8u57qzsznpvh02s8j483aga63cl02k6jt:2000`

To adjust the Fee, The no operators can send:\
`BOND:<node address>::<operator fee in basis pts>`

**Example**: `BOND:maya3guru5gu74z79hef6dt6ykhe7cmjf3f8dcfudge::4000` to see the fee to 40%.

Fees can range from 100 to 9900 basis pts. Setting 10000 causes all rewards to be to the node operator each churn. Setting it to 0 causes rewards to accrue to the bond.

### Bond Provider

#### Adding/Removing Bond

Once whitelisted, a Bond Provider can Bond and Unbond from the node as normal.

**Adding Bond:**

`BOND:<NodeAddress>`

- NodeAddress - MAYANode address (prefixed by `maya`)
- CACAO Tx Value - Amount of LP to bond

**Removing Bond:**

`UNBOND:<NodeAddress>:<Amount>`

- NodeAddress - MAYANode address (prefixed by `maya`)
- Amount - Amount of LP to unbond
- CACAO Tx Value - 1

{% hint style="info" %}
**When can you add Bond?**

When the node is standby, active or not churning, bond amounts can be increased/decreased.
{% endhint %}

### Reward Shares

Operators and Providers all have a bond amount registered to the node. Operators can start at 0.00 bonded. This on-chain bond amount is summed to the total bond, and thus everyone has a fair share in the MAYANode's principle + Liquidity Pool & transaction fees.

The Operator Fee is distributed to the Node Operator address from all CACAO rewards earned by a node after each churn.

If an Operator LEAVES, all the bond is fairly distributed.

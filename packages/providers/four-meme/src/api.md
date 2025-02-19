# TokenManager2 (V2)

TokenManager2 is V2 of TokenManager, which is a significant upgrade that now supports the features of purchasing tokens using both BNB and BEP20.

**Address on BSC**

`0x5c952063c7fc8610FFDB798152D69F0B9550762b`

**ABI File**

`TokenManager2.lite.abi`

## Methods

- **`buyTokenAMAP(address token, uint256 funds, uint256 minAmount)`**
  If the user wants to buy a specific amount of BNB worth of tokens for msg.sender.
  - `token`: Token address
  - `funds`: Amount of BNB
  - `minAmount`: Minimum amount of tokens to be purchased if the price changes
- **`buyTokenAMAP(address token, address to, uint256 funds, uint256 minAmount)`**
  If the user wants to buy a specific amount of BNB worth of tokens for another recipient.
  - `token`: Token address
  - `to`: Specific recipient of the token
  - `funds`: Amount of BNB
  - `minAmount`: Minimum amount of tokens to be purchased if the price changes
- **`buyToken(address token, uint256 amount, uint256 maxFunds)`**
  If the user wants to buy a specific amount of tokens for msg.sender.
  - `token`: Token address
  - `amount`: Amount of tokens
  - `maxFunds`: Maximum amount of BNB that could be spent if the price changes
- **`buyToken(address token, address to, uint256 amount, uint256 maxFunds)`**
  If the user wants to buy a specific amount of tokens for another recipient.
  - `token`: Token address
  - `to`: Recipient of the token
  - `amount`: Amount of tokens
  - `maxFunds`: Maximum amount of BNB that could be spent if the price changes
- **`sellToken(address token, uint256 amount)`**
  If the user wants to sell tokens.
  - `token`: Token address
  - `amount`: Amount of tokens

## Events

- **`TokenCreate(address creator, address token, uint256 requestId, string name, string symbol, uint256 totalSupply, uint256 launchTime, uint256 launchFee)`**
  Emitted when a new token is created.
  - `creator`: Address of the creator of the token
  - `token`: Address of the newly created token
  - `requestId`: Unique request ID for the creation
  - `name`: Name of the token
  - `symbol`: Symbol of the token
  - `totalSupply`: Total supply of the token
  - `launchTime`: Timestamp when the token was launched
  - `launchFee`: Fee paid for launching the token
- **`TokenPurchase(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)`**
  Emitted when a token is purchased.
  - `token`: Address of the token being purchased
  - `account`: Address of the account making the purchase
  - `price`: Price per token at the time of purchase
  - `amount`: Amount of tokens purchased
  - `cost`: Total cost for the purchase
  - `fee`: Fee paid
  - `offers`: Number of offers available at the time of purchase
  - `funds`: Total funds used for the purchase
- **`TokenSale(address token, address account, uint256 price, uint256 amount, uint256 cost, uint256 fee, uint256 offers, uint256 funds)`**
  Emitted when a token is sold.
  - `token`: Address of the token being sold
  - `account`: Address of the account making the sale
  - `price`: Price per token at the time of sale
  - `amount`: Amount of tokens sold
  - `cost`: Total cost for the sale
  - `fee`: Fee paid
  - `offers`: Number of offers available at the time of sale
  - `funds`: Total funds received from the sale
- **`TradeStop(address token)`**
  Emitted when trading for a specific token is stopped.
  - `token`: Address of the token for which trading is stopped
- **`LiquidityAdded(address base, uint256 offers, address quote, uint256 funds)`**
  Emitted when liquidity is added to the token.
  - `base`: Address of the base token
  - `offers`: Number of offers added
  - `quote`: Address of the quote token which is the token traded by. If quote returns address 0, it means the token is traded by BNB. otherwise traded by BEP20
  - `funds`: Total funds added for liquidity

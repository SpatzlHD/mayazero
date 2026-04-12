# How to Use

### Installation <a href="#installation" id="installation"></a>

Install `@xchainjs/xchain-crypto` from `npm`

```
yarn add @xchainjs/xchain-crypto
```

### Development <a href="#development" id="development"></a>

#### Build <a href="#build" id="build"></a>

```
yarn build
```

#### Tests <a href="#tests" id="tests"></a>

```
yarn test
```

### Example <a href="#basic-example-usage" id="basic-example-usage"></a>

#### Generate New Phrases and Encrypt <a href="#generate-new-phrase-and-encrypt" id="generate-new-phrase-and-encrypt"></a>

By default, it will generate a 12-word phrase.\
Create a new phrase using generatePhrase()\
Check phrase validity using validatePhrase()\
Encrypt to keystore using encryptToKeyStore() > takes two arguements (phrase, password)\\

```
// Imports
import { generatePhrase, validatePhrase, encryptToKeyStore, decryptFromKeystore } from "@xchainjs/xchain-crypto"

require('dotenv').config();

const keystore1 = JSON.parse(fs.readFileSync('keystore.json', 'utf8'))
const password = process.env.PASSWORD

// Generate Keystore and save it to a keystore file
const GenerateKeystore = async () => {
    const phrase = generatePhrase()
    console.log(`phrase ${phrase}`)
    const isCorrect = validatePhrase(phrase) //validate phrase if needed returns Boolean
    console.log(`Phrase valid?: ${isCorrect}`)
    const keystore = await encryptToKeyStore(phrase, password)
    fs.writeFileSync(`./keystore.json`, JSON.stringify(keystore, null, 4), 'utf8')
}
```

#### Decrypt Keystore to Retrieve a Phrase <a href="#decrypt-keystore-to-retrieve-phrase" id="decrypt-keystore-to-retrieve-phrase"></a>

Retrieve the phrase by calling decryptFromKeystore()\\

```
const connectWallet = async () => {
    let phrase = await decryptFromKeystore(keystore1, password)
    console.log(`Phrase: ${phrase}`)
}
```

#### Retrieve Seed <a href="#retrieve-seed" id="retrieve-seed"></a>

Retrieve phrase by calling decryptFromKeystore()

```
import { decryptFromKeystore, getSeed } from '@xchainjs/xchain-crypto'

const connectWallet = async () => {
    let phrase = await decryptFromKeystore(keystore1, password)
    console.log(`Phrase: ${phrase}`)
}
```

#### Keystore Type <a href="#keystore-type" id="keystore-type"></a>

```
type Keystore = {
  crypto: {
    cipher: string
    ciphertext: string
    cipherparams: {
      iv: string
    }
    kdf: string
    kdfparams: {
      prf: string
      dklen: number
      salt: string
      c: number
    }
    mac: string
  }
  id: string
  version: number
  meta: string
}
encryptToKeyStore(phrase: string, password: string): Promise<Keystore>
```

#### Constants <a href="#constants" id="constants"></a>

```
// Crypto Constants for xchain
const cipher = 'aes-128-ctr'
const kdf = 'pbkdf2'
const prf = 'hmac-sha256'
const dklen = 32
const c = 262144
const hashFunction = 'sha256'
const meta = 'xchain-keystore'
```

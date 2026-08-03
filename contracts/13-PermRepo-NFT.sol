// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;


import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";



/**
 * @title PermRepoNFT
 *
 * @notice
 *
 * One NFT represents one repository.
 *
 * NFT is only an identity anchor.
 *
 * Backup data:
 *
 *      Arweave
 *
 * Backup index:
 *
 *      Blockchain events
 *
 *
 * Find backup:
 *
 *      contract address
 *          +
 *      tokenId
 *          +
 *      backupNumber
 *
 */
contract PermRepoNFT is
    ERC721,
    EIP712,
    ReentrancyGuard
{


    // ==================================================
    // CONSTANTS
    // ==================================================


    bytes32 private constant ADD_BACKUP_TYPEHASH =
        keccak256(
            "AddBackup(uint256 tokenId,uint256 backupNumber,bytes32 manifestHash,bytes32 merkleRoot,uint256 deadline,uint256 nonce)"
        );



    // ==================================================
    // STORAGE
    // ==================================================


    uint256 private nextTokenId;



    /**
     * tokenId => repository hash
     */
    mapping(uint256 => bytes32)
        public repositoryHash;



    /**
     * repository hash => tokenId
     */
    mapping(bytes32 => uint256)
        public repositoryTokens;



    /**
     * tokenId => number of backups
     */
    mapping(uint256 => uint256)
        public backupCount;



    /**
     * tokenId => signature nonce
     */
    mapping(uint256 => uint256)
        public nonces;



    // ==================================================
    // EVENTS
    // ==================================================


    event RepositoryMinted(
        uint256 indexed tokenId,
        address indexed owner,
        bytes32 indexed repositoryHash
    );



    event BackupAdded(
        uint256 indexed tokenId,
        uint256 indexed backupNumber,
        bytes32 indexed merkleRoot,
        bytes32 manifestHash,
        string manifestURI
    );



    // ==================================================
    // ERRORS
    // ==================================================


    error ZeroAddress();

    error RepositoryExists();

    error InvalidToken();

    error InvalidSignature();

    error DeadlineExpired();



    // ==================================================
    // CONSTRUCTOR
    // ==================================================


    constructor()
        ERC721(
            "PermRepo",
            "PREPO"
        )
        EIP712(
            "PermRepo",
            "1"
        )
    {}



    // ==================================================
    // MINT REPOSITORY NFT
    // ==================================================


    /**
     * @notice
     *
     * Creates free repository NFT.
     *
     * One NFT = one repository.
     *
     */
    function mintRepository(
        address recipient,
        string calldata repository
    )
        external
        nonReentrant
        returns(uint256 tokenId)
    {

        if(recipient == address(0)) {
            revert ZeroAddress();
        }


        /**
         * abi.encode instead of abi.encodePacked
         *
         * avoids string collision warnings
         */
        bytes32 repoHash = keccak256(
            abi.encode(repository)
        );


        if(repositoryTokens[repoHash] != 0) {
            revert RepositoryExists();
        }


        nextTokenId++;

        tokenId = nextTokenId;


        /**
         * Update state BEFORE safeMint.
         *
         * Prevents ERC721 receiver reentrancy.
         */
        repositoryHash[tokenId] = repoHash;

        repositoryTokens[repoHash] = tokenId;


        _safeMint(recipient, tokenId);


        emit RepositoryMinted(
            tokenId,
            recipient,
            repoHash
        );
    }



    // ==================================================
    // ADD BACKUP
    // ==================================================


    /**
     *
     * NFT owner signs backup authorization.
     *
     * Anyone may submit transaction.
     *
     */
    function addBackup(
        uint256 tokenId,
        bytes32 manifestHash,
        bytes32 merkleRoot,
        string calldata manifestURI,
        uint256 deadline,
        bytes calldata signature
    )
        external
        nonReentrant
    {

        address owner = ownerOf(tokenId);


        if(owner == address(0)) {
            revert InvalidToken();
        }


        if(block.timestamp > deadline) {
            revert DeadlineExpired();
        }


        uint256 backupNumber = backupCount[tokenId] + 1;


        bytes32 structHash = keccak256(
            abi.encode(
                ADD_BACKUP_TYPEHASH,
                tokenId,
                backupNumber,
                manifestHash,
                merkleRoot,
                deadline,
                nonces[tokenId]
            )
        );


        bytes32 digest = _hashTypedDataV4(structHash);


        address signer = ECDSA.recover(digest, signature);


        if(signer != owner) {
            revert InvalidSignature();
        }


        nonces[tokenId]++;

        backupCount[tokenId] = backupNumber;


        emit BackupAdded(
            tokenId,
            backupNumber,
            merkleRoot,
            manifestHash,
            manifestURI
        );
    }



    // ==================================================
    // VIEW
    // ==================================================


    function getRepositoryHash(uint256 tokenId)
        external
        view
        returns(bytes32)
    {
        return repositoryHash[tokenId];
    }



    function getBackupCount(uint256 tokenId)
        external
        view
        returns(uint256)
    {
        return backupCount[tokenId];
    }



    function getNonce(uint256 tokenId)
        external
        view
        returns(uint256)
    {
        return nonces[tokenId];
    }

}
